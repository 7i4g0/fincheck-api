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
        sourceTransactions: {
          select: {
            type: true,
            value: true,
            date: true,
          },
        },
        destinationTransactions: {
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
      const realizedSourceTransactions = bankAccount.sourceTransactions.filter(
        (transaction) => new Date(transaction.date) <= today,
      );

      const realizedDestinationTransactions =
        bankAccount.destinationTransactions.filter(
          (transaction) => new Date(transaction.date) <= today,
        );

      // Calculate balance from source transactions (this account is the origin)
      const sourceBalance = realizedSourceTransactions.reduce(
        (acc, transaction) => {
          if (transaction.type === 'INCOME') {
            return acc + transaction.value;
          } else if (transaction.type === 'EXPENSE') {
            return acc - transaction.value;
          } else if (transaction.type === 'TRANSFER') {
            // Money leaving this account
            return acc - transaction.value;
          }
          return acc;
        },
        0,
      );

      // Calculate balance from destination transactions (this account receives transfers)
      const destinationBalance = realizedDestinationTransactions.reduce(
        (acc, transaction) => {
          // Only TRANSFER type has destination account
          if (transaction.type === 'TRANSFER') {
            return acc + transaction.value;
          }
          return acc;
        },
        0,
      );

      const totalTransactions = sourceBalance + destinationBalance;
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
