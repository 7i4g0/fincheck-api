import { BadRequestException, Injectable } from '@nestjs/common';

interface RecaptchaVerifyResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
}

@Injectable()
export class RecaptchaService {
  private readonly secretKey = process.env.RECAPTCHA_SECRET_KEY;
  private readonly verifyUrl =
    'https://www.google.com/recaptcha/api/siteverify';

  async validate(token: string): Promise<boolean> {
    if (!this.secretKey) {
      console.warn(
        'RECAPTCHA_SECRET_KEY not configured. Skipping reCAPTCHA validation.',
      );
      return true;
    }

    try {
      const response = await fetch(this.verifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          secret: this.secretKey,
          response: token,
        }),
      });

      const data: RecaptchaVerifyResponse = await response.json();

      if (!data.success) {
        const errorCodes = data['error-codes']?.join(', ') || 'Unknown error';
        console.error('reCAPTCHA validation failed:', errorCodes);
        throw new BadRequestException(
          'Falha na validação do reCAPTCHA. Por favor, tente novamente.',
        );
      }

      return true;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('reCAPTCHA verification error:', error);
      throw new BadRequestException(
        'Erro ao verificar o reCAPTCHA. Por favor, tente novamente.',
      );
    }
  }
}
