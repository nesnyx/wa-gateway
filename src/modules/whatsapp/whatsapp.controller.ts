import { Controller, Get, Post, Body, Patch, Param, Delete, StreamableFile, Header, Logger, Headers, UnauthorizedException } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { CreateWhatsappDto,LoginWhatsappDto } from './dto/create-whatsapp.dto';


@Controller('whatsapp')
export class WhatsappController {
  
  constructor(
    private readonly whatsappService: WhatsappService
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
  async gowa(@Body() payload: any,@Headers('X-Device-Id') deviceId: string) {
    // if (!verifyWebhookSignature(payload, signature, String(process.env.GOWA_WEBHOOK_SECRET))) {
    //   throw new UnauthorizedException("Unauthorized")
    // }
    return await this.whatsappService.webhookSendMessage(payload,deviceId)
  }

  @Delete("devices")
  async removeDevice(@Headers('X-Device-Id') deviceId: string){
    return await this.whatsappService.removeDevice(deviceId)
  }
  


}
