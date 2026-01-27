import { Injectable } from '@nestjs/common';
import { UsersRepository } from '../../shared/database/repositories/users.repositories';

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

  async completeOnboarding(userId: string) {
    await this.usersRepo.update({
      where: { id: userId },
      data: { onboardingCompleted: true },
    });

    return { message: 'Onboarding completed' };
  }
}
