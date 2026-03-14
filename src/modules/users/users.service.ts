import { Injectable, UnauthorizedException } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { UsersRepository } from '../../shared/database/repositories/users.repositories';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepo: UsersRepository) {}

  getUserById(userId: string) {
    return this.usersRepo.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        createdAt: true,
        onboardingCompleted: true,
      },
    });
  }

  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    const { name } = updateProfileDto;

    await this.usersRepo.update({
      where: { id: userId },
      data: { name },
    });

    return { message: 'Perfil atualizado com sucesso' };
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const { currentPassword, newPassword } = changePasswordDto;

    const user = await this.usersRepo.findUnique({
      where: { id: userId },
      select: { password: true },
    });

    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    const isPasswordValid = await compare(currentPassword, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Senha atual incorreta');
    }

    const hashedNewPassword = await hash(newPassword, 10);

    await this.usersRepo.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    return { message: 'Senha alterada com sucesso' };
  }

  async completeOnboarding(userId: string) {
    await this.usersRepo.update({
      where: { id: userId },
      data: { onboardingCompleted: true },
    });

    return { message: 'Onboarding completed' };
  }

  async deleteAccount(userId: string) {
    await this.usersRepo.delete({
      where: { id: userId },
    });
    return { message: 'Conta excluída com sucesso' };
  }

  async exportData(userId: string) {
    const user = await this.usersRepo.findUniqueForExport(userId);

    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    const {
      bankAccounts,
      categories,
      creditCards,
      transactions,
      creditCardTransactions,
      ...profile
    } = user;

    return {
      exportedAt: new Date().toISOString(),
      profile: {
        name: profile.name,
        email: profile.email,
        createdAt: profile.createdAt,
      },
      accounts: bankAccounts,
      categories,
      creditCards,
      transactions: transactions.map((t) => ({
        name: t.name,
        value: t.value,
        date: t.date,
        type: t.type,
        account: t.bankAccount?.name ?? null,
        destinationAccount: t.destinationBankAccount?.name ?? null,
        category: t.category?.name ?? null,
      })),
      creditCardTransactions: creditCardTransactions.map((t) => ({
        name: t.name,
        value: t.value,
        date: t.date,
        installments: t.installments,
        currentInstallment: t.currentInstallment,
        card: t.creditCard?.name ?? null,
        category: t.category?.name ?? null,
      })),
    };
  }
}
