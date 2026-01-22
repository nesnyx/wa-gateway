import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Status, Whatsapp } from './entities/whatsapp.entity';
import { Repository } from 'typeorm';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  ConnectionState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import pino from 'pino';
import { Logger } from '@nestjs/common';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private sessions = new Map<string, any>();
  private autoReplyCooldown = new Map<string, number>();
  private reconnectAttempts = new Map<string, number>();
  constructor(
    @InjectRepository(Whatsapp)
    private whatsappRepository: Repository<Whatsapp>
  ) { }

  private async restoreSessionAsync(sessionId: string) {
    this.logger.log(`Restoring session: ${sessionId}`);
    try {
      await this.createSession(sessionId);
    } catch (err) {
      this.logger.error(`Gagal restore session ${sessionId}: ${err.message}`);
    }
  }
  async onModuleInit() {
    const activeSessions = await this.whatsappRepository.find({ where: { status: 'CONNECTED' } });
    for (const session of activeSessions) {
      this.restoreSessionAsync(session.session);
    }
  }
  async onModuleDestroy() {
    for (const [sessionId, sock] of this.sessions.entries()) {
      try {
        await sock.logout()
      } catch (err) {
        this.logger.error(`Gagal logout session ${sessionId}:`, err);
      }
      this.sessions.delete(sessionId);
      await this.whatsappRepository.update(
        { session: sessionId },
        { status: Status.DISCONNECTED }
      );
    }
  }

  async createSession(sessionId: string) {
    const sessionPath = path.join(process.cwd(), `/src/modules/whatsapp/sessions/${sessionId}`);
    console.log(sessionPath)
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const sock: any = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['Gemini Bot', 'Chrome', '1.0.0'],
    });
    this.sessions.set(sessionId, sock);
    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        await this.whatsappRepository.update(
          { session: sessionId },
          { session_qr: qr, status: Status.PENDING }
        );
        this.logger.log(`QR Code generated for session: ${sessionId}`);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          const attempts = this.reconnectAttempts.get(sessionId) || 0;

          if (attempts >= 5) {
            this.logger.error(`[${sessionId}] Max reconnect attempts reached. Stopping.`);
            this.sessions.delete(sessionId);
            await fsPromises.rm(sessionPath, {
              recursive: true,
              force: true,
              maxRetries: 3,
              retryDelay: 100
            });
            await this.whatsappRepository.update(
              { session: sessionId },
              { status: Status.DISCONNECTED, session_qr: undefined, phone_number: undefined }
            );
            return;
          }

          this.reconnectAttempts.set(sessionId, attempts + 1);

          const delay = Math.min(1000 * (2 ** attempts), 30000); // Exponential backoff, max 30 detik

          this.logger.warn(`[${sessionId}] Reconnecting in ${delay}ms... (attempt ${attempts + 1})`);

          setTimeout(() => {
            this.createSession(sessionId);
          }, delay);
        } else {
          this.logger.error(`Session ${sessionId} Logged Out`);
          this.sessions.delete(sessionId);
          await fsPromises.rm(sessionPath, { recursive: true, force: true }).catch(err => {
            this.logger.error(`Gagal menghapus folder sesi ${sessionPath}:`, err);
          });
          await this.whatsappRepository.update(
            { session: sessionId },
            { status: Status.DISCONNECTED, session_qr: undefined, phone_number: undefined }
          );
        }
      } else if (connection === 'open') {
        const phoneNumber = sock.user.id.split(':')[0].split('@')[0];
        this.logger.log(`Session ${sessionId} CONNECTED with ${phoneNumber}`);

        await this.whatsappRepository.update(
          { session: sessionId },
          { status: Status.CONNECTED, session_qr: undefined, phone_number: phoneNumber }
        );
      }
    });

    sock.ev.on('messages.upsert', async (m: any) => {
      const messages = m.messages;

      for (const message of messages) {
        if (message.key.fromMe) continue;

        const senderNumber = message.key.remoteJid?.replace('@s.whatsapp.net', '');
        let messageBody = '';

        if (message.message?.conversation) {
          messageBody = message.message.conversation;
        } else if (message.message?.extendedTextMessage?.text) {
          messageBody = message.message.extendedTextMessage.text;
        }

        if (!messageBody) continue;

        const cooldownTime = 10000;
        const lastReply = this.autoReplyCooldown.get(senderNumber);
        if (lastReply && Date.now() - lastReply < cooldownTime) {
          continue;
        }

        this.autoReplyCooldown.set(senderNumber, Date.now());
        const replyMessage = `Halo! Terima kasih atas pesan Anda: "${messageBody}".`;
        try {
          await sock.sendMessage(message.key.remoteJid!, { text: replyMessage });
        } catch (err) {
          this.logger.error(`[${sessionId}] Gagal balas ke ${senderNumber}:`, err);
        }
      }
    })
  }

  async sendMessage(sessionId: string, target: string, message: string) {
    const sock = this.sessions.get(sessionId);
    if (!sock) {
      throw new BadRequestException(`Session ${sessionId} tidak ada di memori.`);
    }
    const formattedTarget = `${target}@s.whatsapp.net`;
    try {
      return await Promise.race([
        sock.sendMessage(formattedTarget, { text: message }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT_WHATSAPP_SERVER')), 15000)
        ),
      ]);
    } catch (error) {
      if (error.message === 'TIMEOUT_WHATSAPP_SERVER') {
        this.logger.warn(`Timeout sending message to ${target}`);
      }
      throw new BadRequestException(`Gagal kirim: ${error.message}`);
    }
  }


  async findOneBySessionId(session: string) {
    return await this.whatsappRepository.findOneBy({ session })
  }

  async findAll() {
    return await this.whatsappRepository.find()
  }


  async statusSessions() {
    return Array.from(this.sessions.keys()).map(id => ({
      sessionId: id,
      connected: !!this.sessions.get(id),
    }));
  }



}
