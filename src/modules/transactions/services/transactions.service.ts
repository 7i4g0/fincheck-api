import { Injectable } from '@nestjs/common';
import { TransactionsRepository } from '../../../shared/database/repositories/transactions.repositories';
import { VerifyBankAccountOwnershipService } from '../../bank-accounts/services/verify-bank-account-ownership.service';
import { VerifyCategoryOwnershipService } from '../../categories/services/verify-category-ownership.service';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { UpdateTransactionDto } from '../dto/update-transaction.dto';
import { TransactionType } from '../entities/Transaction';
import { VerifyTransactionOwnershipService } from './verify-transaction-ownership.service';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly transactionsRepo: TransactionsRepository,
    private readonly verifyBankAccountOwnershipService: VerifyBankAccountOwnershipService,
    private readonly verifyCategoryOwnershipService: VerifyCategoryOwnershipService,
    private readonly verifyTransactionOwnershipService: VerifyTransactionOwnershipService,
  ) {}

  async create(userId: string, createTransactionDto: CreateTransactionDto) {
    const { bankAccountId, categoryId, date, type, value, name } =
      createTransactionDto;
    await this.validateEntitiesOwnership({ userId, bankAccountId, categoryId });

    return this.transactionsRepo.create({
      data: {
        userId,
        bankAccountId,
        categoryId,
        date,
        type,
        value,
        name,
      },
    });
  }

  findAllByUserId(
    userId: string,
    filters: {
      month: number;
      year: number;
      bankAccountId: string;
      type?: TransactionType;
    },
  ) {
    return this.transactionsRepo.findMany({
      where: {
        userId,
        bankAccountId: filters.bankAccountId,
        type: filters.type,
        date: {
          gte: new Date(filters.year, filters.month - 1, 1),
          lte: new Date(filters.year, filters.month, 0),
        },
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            icon: true,
          },
        },
      },
    });
  }

  async update(
    userId: string,
    transactionId: string,
    updateTransactionDto: UpdateTransactionDto,
  ) {
    const { bankAccountId, categoryId, date, type, value, name } =
      updateTransactionDto;
    await this.validateEntitiesOwnership({
      userId,
      bankAccountId,
      categoryId,
      transactionId,
    });

    return this.transactionsRepo.update({
      where: { id: transactionId },
      data: {
        bankAccountId,
        categoryId,
        date,
        type,
        value,
        name,
      },
    });
  }

  async remove(userId: string, transactionId: string) {
    await this.validateEntitiesOwnership({ userId, transactionId });

    await this.transactionsRepo.delete({
      where: { id: transactionId },
    });

    return null;
  }

  private async validateEntitiesOwnership({
    userId,
    bankAccountId,
    categoryId,
    transactionId,
  }: {
    userId: string;
    bankAccountId?: string;
    categoryId?: string;
    transactionId?: string;
  }) {
    await Promise.all([
      transactionId &&
        this.verifyTransactionOwnershipService.validate(userId, transactionId),
      bankAccountId &&
        this.verifyBankAccountOwnershipService.validate(userId, bankAccountId),
      categoryId &&
        this.verifyCategoryOwnershipService.validate(userId, categoryId),
    ]);
  }
}
