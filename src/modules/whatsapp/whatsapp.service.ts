import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
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
    private httpService: HttpService,
  ) { }




  async createDevice(session: string) {
    const headers = { Authorization: this.authorization };
    try {
      const existingDevice = await this.whatsappRepository.findOne({
        where: {
          session
        }
      })
      if (existingDevice) {
        throw new ConflictException("Duplicated device use another name!")
      }
      const device = this.whatsappRepository.create({ session });
      await this.whatsappRepository.save(device);
      const apiResponse = await firstValueFrom(
        this.httpService.post(`${this.gowaBaseUrl}/devices`, {
          device_id: session,
        }, { headers }),
      );
      this.logger.log(`Membuat Device baru ${session}`);
      return apiResponse.data;
    } catch (error: any) {
      await this.removeDevice(session)
      this.logger.error(`Gagal mendaftarkan device ke Gowa: ${error.message}`);
      throw new InternalServerErrorException('Something Wrong with Create Device');
    }
  }

  async checkDevice(deviceId: string, type: string) {
    const headers = {
      'Authorization': this.authorization,
      'X-Device-Id': deviceId
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
    } catch (error: any) {
      console.log(error)
      throw new BadRequestException("Something Wrong with Check Status Device : ", error.message)
    }
  }

  async loginWithCode(deviceId: string, phone: string) {
    const headers = {
      'Authorization': this.authorization,
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

  async logoutWhatsaap(deviceId: string) {
    const headers = {
      'Authorization': this.authorization,
      'X-Device-Id': deviceId,
    }
    try {
      await this.findDeviceId(deviceId)
      const apiResponse = await firstValueFrom(this.httpService.get(`${this.gowaBaseUrl}/app/logout`, { headers }))
      return apiResponse.data
    } catch (error: any) {
      throw new BadRequestException("Something Wrong with Logout : ", error.message)
    }
  }

  async removeDevice(deviceId: string) {
    const headers = {
      'Authorization': this.authorization,
      'X-Device-Id': deviceId,
    }
    try {
      await this.findDeviceId(deviceId)
      await this.whatsappRepository.delete({ session: deviceId });
      const apiResponse = await firstValueFrom(this.httpService.delete(`${this.gowaBaseUrl}/devices/${deviceId}`, { headers }))
      return apiResponse.data
    } catch (error: any) {
      throw new BadRequestException("Something Wrong with Remove : ", error.message)
    }
  }

  async webhookSendMessage(payload: any, deviceId: string) {
    console.log(payload)
    const eventType = payload.event;
    const sessionId = deviceId
    if (eventType !== 'message') {
      return { status: 'ignored' };
    }
    const senderNumber = payload.payload.from;
    const incomingMessage = payload.payload.body;
    this.logger.log(`Pesan masuk dari ${senderNumber} via Session: ${sessionId}`);
    this.logger.log(`Message ${sessionId} : ${incomingMessage}`);
    const sendMessage = await this.sendWhatsappMessage(sessionId, senderNumber, "Orang desa gak butuh dollar");
    return sendMessage
  }

  private async sendWhatsappMessage(session: string, to: string, text: string) {
    const url = `${this.gowaBaseUrl}/send/message`;
    const config = {
      headers: {
        'Authorization': this.authorization,
        'X-Device-Id': session
      },
    };
    const body = {
      phone: to,
      message: text
    };
    try {
      const apiResponse = await firstValueFrom(this.httpService.post(url, body, config));
      this.logger.log(`Berhasil membalas pesan ke ${to} menggunakan session ${session}`);
      return apiResponse.data
    } catch (error: any) {
      this.logger.error(`Gagal mengirim pesan via GOWA: ${error.message}`);
      throw new BadRequestException("Something Wrong Send Message Webhook")
    }
  }

  async findDeviceId(deviceId: string) {
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

  async logoutDevice(deviceId: string) {
    const config = {
      headers: {
        'Authorization': this.authorization,
        'X-Device-Id': deviceId
      },
    };
    try {
      return await firstValueFrom(this.httpService.get(`${this.gowaBaseUrl}/app/logout`, config));
    } catch (error) {
      throw new BadRequestException("Something Wrong with Logout Device")
    }
  }
}
