import { Injectable } from '@nestjs/common';
import { BankAccountsRepository } from '../../../shared/database/repositories/bank-accounts.repositories';
import { CreateBankAccountDto } from '../dto/create-bank-account.dto';
import { UpdateBankAccountDto } from '../dto/update-bank-account.dto';
import { VerifyBankAccountOwnershipService } from './verify-bank-account-ownership.service';

@Injectable()
export class BankAccountsService {
  constructor(
    private readonly bankAccountsRepo: BankAccountsRepository,
    private readonly verifyBankAccountOwnership: VerifyBankAccountOwnershipService,
  ) {}

  create(userId: string, createBankAccountDto: CreateBankAccountDto) {
    const { color, initialBalance, name, type } = createBankAccountDto;
    return this.bankAccountsRepo.create({
      data: {
        userId,
        color,
        initialBalance,
        name,
        type,
      },
    });
  }

  async findAllByUserId(userId: string) {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const bankAccounts = await this.bankAccountsRepo.findMany({
      where: {
        userId,
      },
      include: {
        transactions: {
          select: {
            type: true,
            value: true,
            date: true,
          },
        },
      },
    });

    return bankAccounts.map((bankAccount) => {
      // Only consider transactions with date <= today for current balance
      const realizedTransactions = bankAccount.transactions.filter(
        (transaction) => new Date(transaction.date) <= today,
      );

      const totalTransactions = realizedTransactions.reduce(
        (acc, transaction) =>
          acc +
          (transaction.type === 'INCOME'
            ? transaction.value
            : -transaction.value),
        0,
      );

      const currentBalance = bankAccount.initialBalance + totalTransactions;

      return {
        ...bankAccount,
        totalTransactions,
        currentBalance,
      };
    });
  }

  async update(
    userId: string,
    bankAccountId: string,
    updateBankAccountDto: UpdateBankAccountDto,
  ) {
    await this.verifyBankAccountOwnership.validate(userId, bankAccountId);

    const { color, initialBalance, name, type } = updateBankAccountDto;
    return this.bankAccountsRepo.update({
      where: {
        id: bankAccountId,
        userId,
      },
      data: {
        color,
        initialBalance,
        name,
        type,
      },
    });
  }

  async remove(userId: string, bankAccountId: string) {
    await this.verifyBankAccountOwnership.validate(userId, bankAccountId);

    await this.bankAccountsRepo.delete({
      where: {
        id: bankAccountId,
        userId,
      },
    });

    return null;
  }
}
