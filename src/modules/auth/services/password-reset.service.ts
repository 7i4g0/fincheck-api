import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PasswordResetTokensRepository } from '../../../shared/database/repositories/password-reset-tokens.repositories';
import { UsersRepository } from '../../../shared/database/repositories/users.repositories';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { EmailService } from './email.service';

@Injectable()
export class PasswordResetService {
  private readonly TOKEN_EXPIRATION_HOURS = 1; // Token expires in 1 hour

  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly tokensRepo: PasswordResetTokensRepository,
    private readonly emailService: EmailService,
  ) {}

  async requestPasswordReset(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;

    const user = await this.usersRepo.findUnique({
      where: { email },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return {
        message:
          'Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.',
      };
    }

    // Generate a secure token
    const token = randomBytes(32).toString('hex');

    // Calculate expiration time
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.TOKEN_EXPIRATION_HOURS);

    // Save the token
    await this.tokensRepo.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    // Send email with reset link
    await this.emailService.sendPasswordResetEmail(
      email,
      token,
      user.name ?? undefined,
    );

    return {
      message:
        'Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.',
    };
  }

  async validateToken(token: string) {
    const resetToken = await this.tokensRepo.findByToken(token);

    if (!resetToken) {
      throw new NotFoundException('Token inválido ou expirado');
    }

    if (resetToken.usedAt) {
      throw new BadRequestException('Este token já foi utilizado');
    }

    if (new Date() > resetToken.expiresAt) {
      throw new BadRequestException('Token expirado');
    }

    return { valid: true, email: resetToken.user.email };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { token, newPassword } = resetPasswordDto;

    const resetToken = await this.tokensRepo.findByToken(token);

    if (!resetToken) {
      throw new NotFoundException('Token inválido ou expirado');
    }

    if (resetToken.usedAt) {
      throw new BadRequestException('Este token já foi utilizado');
    }

    if (new Date() > resetToken.expiresAt) {
      throw new BadRequestException('Token expirado');
    }

    // Hash the new password
    const hashedPassword = await hash(newPassword, 10);

    // Update user's password
    await this.usersRepo.update({
      where: { id: resetToken.userId },
      data: { password: hashedPassword },
    });

    // Mark token as used
    await this.tokensRepo.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    });

    return { message: 'Senha alterada com sucesso!' };
  }
}
