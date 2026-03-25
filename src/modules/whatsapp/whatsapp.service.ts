import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Status, Whatsapp } from './entities/whatsapp.entity';
import { Repository } from 'typeorm';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  ConnectionState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import pino from 'pino';
import { Logger } from '@nestjs/common';
import * as fs from "fs"
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
    const sessionsDir = path.join(process.cwd(), 'sessions'); // lebih aman, di root project
    const sessionPath = path.join(sessionsDir, sessionId);

    // Pastikan folder ada
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();
    const sock: any = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['Ubuntu', 'Chrome', ''],
      version:version,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 0,
      keepAliveIntervalMs: 10000,
    });

    this.sessions.set(sessionId, sock);

    sock.ev.on('creds.update', saveCreds);

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
        const error = lastDisconnect?.error as Boom | Error | undefined;
        const statusCode = (error as Boom)?.output?.statusCode;
        const reason = (error as Boom)?.output?.payload?.error || error?.message;
        this.logger.error(`[${sessionId}] Connection closed. Status: ${statusCode}, Reason: ${reason}`);
        this.logger.error(`Full error:`, error);
        this.sessions.delete(sessionId);

        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          const attempts = this.reconnectAttempts.get(sessionId) || 0;

          if (attempts >= 8) {
            this.logger.error(`[${sessionId}] Max reconnect attempts reached. Cleaning up.`);
            this.reconnectAttempts.delete(sessionId); // Reset counter

            // Hapus folder karena kemungkinan besar kredensial korup
            await fsPromises.rm(sessionPath, { recursive: true, force: true }).catch(() => { });

            await this.whatsappRepository.update(
              { session: sessionId },
              { status: Status.DISCONNECTED, session_qr: undefined, phone_number: undefined }
            );
            return;
          }

          this.reconnectAttempts.set(sessionId, attempts + 1);
          const delay = Math.min(1000 * Math.pow(2, attempts), 300000) + Math.random() * 1000;

          this.logger.warn(`[${sessionId}] Reconnecting (Attempt ${attempts + 1}) in ${delay}ms...`);

          setTimeout(() => {
            this.createSession(sessionId);
          }, delay);
        } else {
          // Jika Logged Out (Logout dari HP), hapus permanen
          this.logger.error(`Session ${sessionId} Logged Out`);
          this.reconnectAttempts.delete(sessionId);
          await fsPromises.rm(sessionPath, { recursive: true, force: true }).catch(() => { });
          await this.whatsappRepository.update(
            { session: sessionId },
            { status: Status.DISCONNECTED, session_qr: undefined, phone_number: undefined }
          );
        }
      } else if (connection === 'open') {
        this.logger.log(`Session ${sessionId} CONNECTED`);

        // --- PENTING: Reset attempt saat berhasil konek ---
        this.reconnectAttempts.set(sessionId, 0);

        const phoneNumber = sock.user.id.split(':')[0].split('@')[0];
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
