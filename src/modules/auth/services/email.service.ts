import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { getPasswordResetEmailTemplate } from '../templates/password-reset.template';

@Injectable()
export class EmailService {
  private readonly resend: Resend;
  private readonly logger = new Logger(EmailService.name);
  private readonly fromEmail = 'Grana em Ordem <noreply@granaemordem.app>';

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      this.logger.warn(
        'RESEND_API_KEY não configurada. Emails não serão enviados.',
      );
    }

    this.resend = new Resend(apiKey);
  }

  async sendPasswordResetEmail(
    email: string,
    token: string,
    userName?: string,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || 'https://granaemordem.app';
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject: 'Recuperação de Senha - Grana em Ordem',
        html: getPasswordResetEmailTemplate({ resetLink, userName }),
      });

      if (error) {
        this.logger.error('Erro ao enviar email:', error);
        throw error;
      }

      this.logger.log(`Email de recuperação enviado para ${email}`);
      return data;
    } catch (error) {
      this.logger.error('Falha ao enviar email de recuperação:', error);
      // Don't throw - we don't want to expose email sending failures to users
      // The user will still see the success message for security reasons
    }
  }
}
