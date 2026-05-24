import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Status, Whatsapp } from './entities/whatsapp.entity';
import { DataSource, Repository } from 'typeorm';
import { Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { first, firstValueFrom } from 'rxjs';
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly gowaBaseUrl = String(process.env.GOWA_BASEURL)
  private readonly authorization = 'Basic ' + Buffer.from(`${String(process.env.GOWA_USERNAME)}:${String(process.env.GOWA_PASSWORD)}`).toString('base64')
  constructor(
    @InjectRepository(Whatsapp)
    private whatsappRepository: Repository<Whatsapp>,
    private dataSource: DataSource,
    private httpService: HttpService,
  ) { }


  private async findDeviceId(deviceId: string) {
    const existing = await this.whatsappRepository.findOne({
      where: {
        session: deviceId
      }
    })
    if (!existing) {
      throw new NotFoundException(`Device ID ${deviceId} not found`)
    }
    return existing
  }

  async createDevice(session: string) {
    const headers = { Authorization: this.authorization };

    try {
      // Gunakan transaksi otomatis
      await this.dataSource.transaction(async (manager) => {
        await manager.save(Whatsapp, { session });
      });

      // API call dilakukan di LUAR transaksi database
      const apiResponse = await firstValueFrom(
        this.httpService.post(`${this.gowaBaseUrl}/devices`, {
          device_id: session,
        }, { headers }),
      );

      this.logger.log(`Membuat Device baru ${session}`);
      return apiResponse.data;
    } catch (error : any) {
      // Jika API gagal, lakukan kompensasi (hapus record database)
      // Jangan di dalam transaksi, karena API call bisa gagal setelah transaksi sukses
      this.logger.error(error.message);

      // Hapus record yang sudah terlanjur tersimpan (kalau memang tersimpan)
      try {
        await this.whatsappRepository.delete({ session });
      } catch (deleteError) {
        this.logger.error('Gagal menghapus device setelah rollback', deleteError);
      }

      throw new InternalServerErrorException('Transaksi gagal, data disinkronkan kembali.');
    }
  }

  async checkDevice(deviceId: string, type: string) {
    const headers = {
      'X-Device-Id': deviceId,
      'Authorization': this.authorization
    }
    try {
      await this.findDeviceId(deviceId)
      if (type == "status") {
        const apiResponse = await firstValueFrom(this.httpService.get(`${this.gowaBaseUrl}/devices/${deviceId}`, {
          headers
        }))
        return apiResponse.data
      } else if (type == "connection") {

        return await firstValueFrom(this.httpService.get(`${this.gowaBaseUrl}/devices/${deviceId}`, {
          headers
        }))
      } else {
        return
      }
    } catch (error) {
      throw new BadRequestException("Something Wrong with Check Status Device")
    }
  }

  async loginWithCode(deviceId: string, phone: string) {
    const headers = {
      'X-Device-Id': deviceId,

    }
    try {
      await this.findDeviceId(deviceId)
      const apiResponse = await firstValueFrom(this.httpService.get(`${this.gowaBaseUrl}/app/login-with-code?phone=${phone}`, { headers }))
      return apiResponse.data
    } catch (error: any) {
      throw new BadRequestException("Something Wrong with Login with code : ", error.message)
    }
  }

  async removeDevice(deviceId: string) {
    const headers = {
      'X-Device-Id': deviceId,

    }
    try {
      await this.findDeviceId(deviceId)
      const apiResponse = await firstValueFrom(this.httpService.delete(`${this.gowaBaseUrl}/devices/${deviceId}`, { headers }))
      return apiResponse.data
    } catch (error: any) {
      throw new BadRequestException("Something Wrong with Remove : ", error.message)
    }
  }
}
