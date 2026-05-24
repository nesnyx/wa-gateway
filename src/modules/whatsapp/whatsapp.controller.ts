import { Controller, Get, Post, Body, Patch, Param, Delete, StreamableFile, Header, Logger, Headers, UnauthorizedException } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { CreateWhatsappDto } from './dto/create-whatsapp.dto';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';


@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger();
  private readonly gowaBaseURL = String(process.env.GOWA_BASEURL);
  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly httpService: HttpService,
  ) { }

  @Post('devices')
  async createDevice(@Body() payload: CreateWhatsappDto) {
    return await this.whatsappService.createDevice(payload.session);
  }

  @Get("status")
  async status(@Headers('X-Device-Id') deviceId: string) {
    return await this.whatsappService.checkDevice(deviceId, 'status')
  }

  @Get("login-with-code")
  async loginWithCode(@Headers('X-Device-Id') deviceId: string, @Body() phone: string) {
    return await this.whatsappService.loginWithCode(deviceId, phone)
  }


  @Post("gowa")
  async gowa(@Body() payload: any,@Headers('X-Device-Id') deviceId: string) {
    // if (!verifyWebhookSignature(payload, signature, String(process.env.GOWA_WEBHOOK_SECRET))) {
    //   throw new UnauthorizedException("Unauthorized")
    // }
    const eventType = payload.event;
    const sessionId = deviceId
    if (eventType !== 'message') {
      return { status: 'ignored' };
    }
    const senderNumber = payload.payload.from;
    const incomingMessage = payload.payload.body;
    this.logger.log(`Pesan masuk dari ${senderNumber} via Session: ${sessionId}`);
    this.logger.log(`Message ${sessionId} : ${incomingMessage}`);
    await this.sendWhatsappMessage(sessionId, senderNumber, "Orang desa gak butuh dollar");
    return { status: 'success' };
  }
  private async sendWhatsappMessage(session: string, to: string, text: string) {
    const url = `${this.gowaBaseURL}/send/message`;
    const config = {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${String(process.env.GOWA_USERNAME)}:${String(process.env.GOWA_PASSWORD)}`).toString('base64'),
        'X-Device-Id':session
      },
    };
    const body = {
      phone: to,
      message: text
    };
    try {
      await firstValueFrom(this.httpService.post(url, body, config));
      this.logger.log(`Berhasil membalas pesan ke ${to} menggunakan session ${session}`);
    } catch (error: any) {
      this.logger.error(`Gagal mengirim pesan via GOWA: ${error.message}`);
    }
  }


}
