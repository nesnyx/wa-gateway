import { Controller, Get, Post, Body, Patch, Param, Delete, StreamableFile, Header, Logger, Headers, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { CreateWhatsappDto, LoginWhatsappDto } from './dto/create-whatsapp.dto';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';


@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger();
  private readonly gowaBaseUrl = String(process.env.GOWA_BASEURL)
  private readonly authorization = 'Basic ' + Buffer.from(`${String(process.env.GOWA_USERNAME)}:${String(process.env.GOWA_PASSWORD)}`).toString('base64')
  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly httpService: HttpService
  ) { }

  @Post('devices')
  async createDevice(@Body() payload: CreateWhatsappDto) {
    return await this.whatsappService.createDevice(payload.session);
  }

  @Get("status")
  async status(@Headers('X-Device-Id') deviceId: string) {
    return await this.whatsappService.checkDevice(deviceId, 'status')
  }

  @Post("login-with-code")
  async loginWithCode(@Headers('X-Device-Id') deviceId: string, @Body() payload: LoginWhatsappDto) {
    return await this.whatsappService.loginWithCode(deviceId, String(payload.phone))
  }


  @Post("gowa")
  async gowa(@Body() payload: any) {
    console.log(payload)
    // if (!verifyWebhookSignature(payload, signature, String(process.env.GOWA_WEBHOOK_SECRET))) {
    //   throw new UnauthorizedException("Unauthorized")
    // }
    const eventType = payload.event;
    const sessionId = payload.device_id
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



  @Delete("devices")
  async removeDevice(@Headers('X-Device-Id') deviceId: string) {
    return await this.whatsappService.removeDevice(deviceId)
  }






}
