import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PasswordResetTokensRepository {
  constructor(private readonly prismaService: PrismaService) {}

  create(createDto: Prisma.PasswordResetTokenCreateArgs) {
    return this.prismaService.passwordResetToken.create(createDto);
  }

  findByToken(token: string) {
    return this.prismaService.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });
  }

  update(updateDto: Prisma.PasswordResetTokenUpdateArgs) {
    return this.prismaService.passwordResetToken.update(updateDto);
  }

  deleteExpiredTokens() {
    return this.prismaService.passwordResetToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { not: null } }],
      },
    });
  }
}
