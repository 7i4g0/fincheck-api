import { BadRequestException, Injectable } from '@nestjs/common';
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
    const {
      bankAccountId,
      destinationBankAccountId,
      categoryId,
      date,
      type,
      value,
      name,
    } = createTransactionDto;

    // Especial validation for transfers
    if (type === TransactionType.TRANSFER) {
      if (!destinationBankAccountId) {
        throw new BadRequestException(
          'A conta de destino é obrigatória para transferências',
        );
      }
      if (bankAccountId === destinationBankAccountId) {
        throw new BadRequestException(
          'A conta de origem e destino devem ser diferentes',
        );
      }
      await this.validateEntitiesOwnership({
        userId,
        bankAccountId,
        destinationBankAccountId,
      });
    } else {
      await this.validateEntitiesOwnership({
        userId,
        bankAccountId,
        categoryId,
      });
    }

    return this.transactionsRepo.create({
      data: {
        userId,
        bankAccountId,
        destinationBankAccountId:
          type === TransactionType.TRANSFER ? destinationBankAccountId : null,
        categoryId: type !== TransactionType.TRANSFER ? categoryId : null,
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
        OR: filters.bankAccountId
          ? [
              { bankAccountId: filters.bankAccountId },
              { destinationBankAccountId: filters.bankAccountId },
            ]
          : undefined,
        type: filters.type,
        date: {
          gte: new Date(
            Date.UTC(filters.year, filters.month - 1, 1, 0, 0, 0, 0),
          ),
          lt: new Date(Date.UTC(filters.year, filters.month, 1, 0, 0, 0, 0)),
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
        destinationBankAccount: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        bankAccount: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        creditCard: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
    });
  }

  async update(
    userId: string,
    transactionId: string,
    updateTransactionDto: UpdateTransactionDto,
  ) {
    await this.ensureNotInvoiceTransaction(transactionId);

    const {
      bankAccountId,
      destinationBankAccountId,
      categoryId,
      date,
      type,
      value,
      name,
    } = updateTransactionDto;

    // Special validation for transfers
    if (type === TransactionType.TRANSFER) {
      if (!destinationBankAccountId) {
        throw new BadRequestException(
          'A conta de destino é obrigatória para transferências',
        );
      }
      if (bankAccountId === destinationBankAccountId) {
        throw new BadRequestException(
          'A conta de origem e destino devem ser diferentes',
        );
      }
      await this.validateEntitiesOwnership({
        userId,
        bankAccountId,
        destinationBankAccountId,
        transactionId,
      });
    } else {
      await this.validateEntitiesOwnership({
        userId,
        bankAccountId,
        categoryId,
        transactionId,
      });
    }

    return this.transactionsRepo.update({
      where: { id: transactionId },
      data: {
        bankAccountId,
        destinationBankAccountId:
          type === TransactionType.TRANSFER ? destinationBankAccountId : null,
        categoryId: type !== TransactionType.TRANSFER ? categoryId : null,
        date,
        type,
        value,
        name,
      },
    });
  }

  async remove(userId: string, transactionId: string) {
    await this.validateEntitiesOwnership({ userId, transactionId });
    await this.ensureNotInvoiceTransaction(transactionId);

    await this.transactionsRepo.delete({
      where: { id: transactionId },
    });

    return null;
  }

  private async ensureNotInvoiceTransaction(transactionId: string) {
    const transaction = await this.transactionsRepo.findFirst({
      where: { id: transactionId },
      select: { creditCardId: true, invoiceMonth: true, invoiceYear: true },
    });
    if (
      transaction?.creditCardId != null &&
      transaction?.invoiceMonth != null &&
      transaction?.invoiceYear != null
    ) {
      throw new BadRequestException(
        'Transação de fatura é gerada automaticamente e não pode ser editada nem excluída.',
      );
    }
  }

  private async validateEntitiesOwnership({
    userId,
    bankAccountId,
    destinationBankAccountId,
    categoryId,
    transactionId,
  }: {
    userId: string;
    bankAccountId?: string;
    destinationBankAccountId?: string;
    categoryId?: string;
    transactionId?: string;
  }) {
    await Promise.all([
      transactionId &&
        this.verifyTransactionOwnershipService.validate(userId, transactionId),
      bankAccountId &&
        this.verifyBankAccountOwnershipService.validate(userId, bankAccountId),
      destinationBankAccountId &&
        this.verifyBankAccountOwnershipService.validate(
          userId,
          destinationBankAccountId,
        ),
      categoryId &&
        this.verifyCategoryOwnershipService.validate(userId, categoryId),
    ]);
  }
}
