import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

const exportDataSelect = {
  name: true,
  email: true,
  createdAt: true,
  bankAccounts: {
    select: {
      name: true,
      type: true,
      initialBalance: true,
      createdAt: true,
    },
  },
  categories: {
    select: {
      name: true,
      type: true,
      estimatedValue: true,
    },
  },
  creditCards: {
    select: {
      name: true,
      limit: true,
      closingDay: true,
      dueDay: true,
      createdAt: true,
    },
  },
  transactions: {
    select: {
      name: true,
      value: true,
      date: true,
      type: true,
      bankAccount: { select: { name: true } },
      destinationBankAccount: { select: { name: true } },
      category: { select: { name: true } },
    },
  },
  creditCardTransactions: {
    select: {
      name: true,
      value: true,
      date: true,
      installments: true,
      currentInstallment: true,
      category: { select: { name: true } },
      creditCard: { select: { name: true } },
    },
  },
} as const;

export type UserForExport = Prisma.UserGetPayload<{
  select: typeof exportDataSelect;
}>;

@Injectable()
export class UsersRepository {
  constructor(private readonly prismaService: PrismaService) {}

  create(createDto: Prisma.UserCreateArgs) {
    return this.prismaService.user.create(createDto);
  }

  findUnique(findUniqueDto: Prisma.UserFindUniqueArgs) {
    return this.prismaService.user.findUnique(findUniqueDto);
  }

  findUniqueForExport(userId: string): Promise<UserForExport | null> {
    return this.prismaService.user.findUnique({
      where: { id: userId },
      select: exportDataSelect,
    });
  }

  update(updateDto: Prisma.UserUpdateArgs) {
    return this.prismaService.user.update(updateDto);
  }

  delete(deleteDto: Prisma.UserDeleteArgs) {
    return this.prismaService.user.delete(deleteDto);
  }
}
