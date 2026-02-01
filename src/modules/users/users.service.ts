import { Injectable, UnauthorizedException } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { UsersRepository } from '../../shared/database/repositories/users.repositories';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepo: UsersRepository) {}

  findAll() {
    return `This action returns all users`;
  }

  findOne(id: number) {
    return `This action returns a #${id} user`;
  }

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
}
