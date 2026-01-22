import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Status, Whatsapp } from './entities/whatsapp.entity';
import { Repository } from 'typeorm';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  ConnectionState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as path from 'path';
import * as fs from 'fs';
import pino from 'pino';
import { Logger } from '@nestjs/common';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private sessions = new Map();
  constructor(
    @InjectRepository(Whatsapp)
    private whatsappRepository: Repository<Whatsapp>
  ) { }

  async createSession(sessionId: string) {
    const sessionPath = path.join(__dirname, `./src/modules/whatsapp/sessions/${sessionId}`);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const sock: any = makeWASocket({
      auth: state,
      defaultQueryTimeoutMs: 60000,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }) as any,
    });

    sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(`QR Code generated for session: ${sessionId}`);
        await this.whatsappRepository.update(
          { session: sessionId },
          { session_qr: qr, status: Status.PENDING }
        );
        console.log('QR Baru telah diperbarui di Database');
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(`Connection closed for ${sessionId}. Reconnecting: ${shouldReconnect}`);

        if (shouldReconnect) {
          this.createSession(sessionId);
        } else {
          fs.rmSync(sessionPath, { recursive: true, force: true });
          await this.whatsappRepository.update({ session: sessionId }, { status: Status.DISCONNECTED, session_qr: undefined });
        }
      } else if (connection === 'open') {
        console.log(`Session ${sessionId} is now active!`);
        const phoneNumber = sock.user.id.split(':')[0];

        await this.whatsappRepository.update(
          { session: sessionId },
          {
            status: Status.CONNECTED,
            session_qr: undefined,
            phone_number: phoneNumber
          }
        );
      }
    });
    sock.ev.on('creds.update', saveCreds);
    this.sessions.set(sessionId, sock);
    return sock;
  }


  async findOneBySessionId(session: string) {
    return await this.whatsappRepository.findOneBy({ session })
  }

}
