import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../../modules/auth/services/email.service';
import { env } from '../config/env';

export interface OperationalErrorAlert {
  status: number;
  method: string;
  path: string;
  userId?: string;
  userMessage: string;
  cause: string;
}

const COOLDOWN_MS = 15 * 60 * 1000;
const NOTIFY_STATUSES = new Set([429, 500, 502, 503, 504]);

@Injectable()
export class ErrorAlertService {
  private readonly logger = new Logger(ErrorAlertService.name);
  private readonly lastSentAt = new Map<string, number>();

  constructor(private readonly emailService: EmailService) {}

  shouldNotify(status: number): boolean {
    return Boolean(env.errorNotifyEmail) && NOTIFY_STATUSES.has(status);
  }

  notify(alert: OperationalErrorAlert): void {
    if (!this.shouldNotify(alert.status)) {
      return;
    }

    const key = `${alert.status}:${alert.method}:${alert.path}:${alert.cause.slice(0, 120)}`;
    const now = Date.now();
    const lastSent = this.lastSentAt.get(key);

    if (lastSent && now - lastSent < COOLDOWN_MS) {
      return;
    }

    this.lastSentAt.set(key, now);

    void this.emailService
      .sendErrorAlert({
        ...alert,
        timestamp: new Date().toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
        }),
      })
      .catch((error) => {
        this.logger.error('Falha ao disparar alerta operacional', error);
      });
  }
}
