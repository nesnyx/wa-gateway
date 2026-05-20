import { Controller, Get, Post, Body, Patch, Param, Delete, StreamableFile, Header, Logger } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { CreateWhatsappDto } from './dto/create-whatsapp.dto';
import * as QRCode from 'qrcode';
import { InjectRepository } from '@nestjs/typeorm';
import { Whatsapp } from './entities/whatsapp.entity';
import { Repository } from 'typeorm';
import { SendMessageDto } from './dto/send-message.dto';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';

@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger();
  private readonly gowaBaseURL = 'https://app-wa.nexisthub.id';
  constructor(
    @InjectRepository(Whatsapp)
    private whatsappRepository: Repository<Whatsapp>,
    private readonly whatsappService: WhatsappService,
    private readonly httpService: HttpService) { }


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

  @Post("gowa")
  async gowa(@Body() payload: any) {
    this.logger.log(payload)
    const eventType = payload.event;
    const sessionId = payload.device_id;
    if (eventType !== 'message') {
      return { status: 'ignored' };
    }
    const senderNumber = payload.payload.from; 
    const incomingMessage = payload.payload.body;

    this.logger.log(`Pesan masuk dari ${senderNumber} via Session: ${sessionId}`);
    this.logger.log(`Message ${sessionId} : ${incomingMessage}`)
    await this.sendWhatsappMessage(sessionId, senderNumber, "oke siap");
    return { status: 'success' };
  }

  private async sendWhatsappMessage(session: string, to: string, text: string) {
    const url = `${this.gowaBaseURL}/send/message`;

    // Sesuaikan dengan konfigurasi APP_BASIC_AUTH GOWA kamu jika ada
    const config = {
      headers: {
        // 'Authorization': 'Basic ' + Buffer.from('username:password').toString('base64')
        'Authorization':'Basic '+ Buffer.from('nexisthub:QbGmCsaUW4nfrcg4UtSc4jsVZsqngFX2QAtQJYJhcNr24zpufsL8R6TfrpgoVsa').toString('base64')
      },
    
    };

    const body = {
      phone: to, // <--- Nomor tujuan (JID dari whatsapp, misal: 628123456789@s.whatsapp.net)
      message: text
    };

    try {
 
      await firstValueFrom(this.httpService.post(url, body, config));
      this.logger.log(`Berhasil membalas pesan ke ${to} menggunakan session ${session}`);
    } catch (error: any) {
      this.logger.error(`Gagal mengirim pesan via GOWA: ${error.message}`);
    }
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
