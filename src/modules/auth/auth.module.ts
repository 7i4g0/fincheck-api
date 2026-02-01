import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { env } from '../../shared/config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailService } from './services/email.service';
import { PasswordResetService } from './services/password-reset.service';
import { RecaptchaService } from './services/recaptcha.service';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: env.jwtSecret,
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RecaptchaService,
    PasswordResetService,
    EmailService,
  ],
})
export class AuthModule {}
