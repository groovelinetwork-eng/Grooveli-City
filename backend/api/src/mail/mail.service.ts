import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { env } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Sends transactional email over SMTP. Works with any provider that offers
 * SMTP (Postmark, SES, Resend, Mailgun…). In development it points at Mailpit
 * (backend/docker-compose.yml), which shows every email at http://localhost:8025.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly transport: Transporter;

  constructor() {
    const e = env();
    this.transport = createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_SECURE,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined,
    });
  }

  /**
   * Sends without failing the caller's request: a mail outage must not block
   * sign-up or reset. Failures are logged for alerting.
   */
  async send(message: MailMessage): Promise<void> {
    try {
      await this.transport.sendMail({ from: env().EMAIL_FROM, ...message });
    } catch (err) {
      this.logger.error(`Email to ${message.to.replace(/^(.).*@/, '$1***@')} failed: ${(err as Error).message}`);
    }
  }

  link(path: string) {
    return `${env().APP_URL.replace(/\/$/, '')}${path}`;
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
