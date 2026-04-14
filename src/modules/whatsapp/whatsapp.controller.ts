import { Controller, Get, Post, Body, Patch, Param, Delete, StreamableFile, Header } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { CreateWhatsappDto } from './dto/create-whatsapp.dto';
import * as QRCode from 'qrcode';
import { InjectRepository } from '@nestjs/typeorm';
import { Whatsapp } from './entities/whatsapp.entity';
import { Repository } from 'typeorm';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('whatsapp')
export class WhatsappController {
  constructor(
    @InjectRepository(Whatsapp)
    private whatsappRepository: Repository<Whatsapp>,
    private readonly whatsappService: WhatsappService) { }


  @Get()
  async findAll() {
    return await this.whatsappService.findAll()
  }

  @Post("generated-qr")
  async create(@Body() createWhatsappDto: CreateWhatsappDto) {
    let session = await this.whatsappRepository.findOneBy({ session: createWhatsappDto.session });

    if (session && session.status === 'CONNECTED') {
      return {
        message: 'Session already connected',
        sessionId: session.session,
        status: session.status,
      };
    }
    if (!session) {
      session = this.whatsappRepository.create({ session: createWhatsappDto.session });
      await this.whatsappRepository.save(session);
    }
    await this.whatsappService.createSession(session.session);

    return {
      message: 'Initializing session...',
      sessionId: session,
    };
  }

  @Get('status/:sessionId')
  async getStatus(@Param('sessionId') sessionId: string) {
    const session = await this.whatsappService.findOneBySessionId(sessionId);
    if (!session) return { message: 'Session not found' };
    return {
      status: session.status,
      qr: session.session_qr,
      phoneNumber: session.phone_number
    };
  }

  @Get('qr/:sessionId')
  @Header('Content-Type', 'image/png')
  async getQr(@Param('sessionId') sessionId: string) {
    const session = await this.whatsappService.findOneBySessionId(sessionId);
    if (!session) return { message: 'Session not found' };
    const qrBuffer = await QRCode.toBuffer(session.session_qr, {
      errorCorrectionLevel: 'H',
      margin: 4,
      scale: 10
    });
    return new StreamableFile(qrBuffer);
  }


  @Post("send-message")
  async sendMessage(@Body() sendMessageDto: SendMessageDto) {
    return await this.whatsappService.sendMessage(
      sendMessageDto.sessionId,
      sendMessageDto.target,
      sendMessageDto.message
    );


  }

  @Get("status-sessions")
  async statusSessions() {
    return await this.whatsappService.statusSessions();
  }
  @Get(":sessionId")
  async findBySession(@Param('sessionId') sessionId: string) {
    return await this.whatsappService.findOneBySessionId(sessionId)
  }


}
