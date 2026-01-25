import { CreditCardTransactionsRepository } from '@/shared/database/repositories/credit-card-transactions.repositories';
import { CreditCardsRepository } from '@/shared/database/repositories/credit-cards.repositories';
import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateCreditCardTransactionDto } from '../dto/create-credit-card-transaction.dto';
import { UpdateCreditCardTransactionDto } from '../dto/update-credit-card-transaction.dto';
import { InvoiceService } from './invoice.service';
import { VerifyCreditCardOwnershipService } from './verify-credit-card-ownership.service';

@Injectable()
export class CreditCardTransactionsService {
  constructor(
    private readonly creditCardTransactionsRepo: CreditCardTransactionsRepository,
    private readonly creditCardsRepo: CreditCardsRepository,
    private readonly verifyCreditCardOwnership: VerifyCreditCardOwnershipService,
    private readonly invoiceService: InvoiceService,
  ) {}

  /**
   * Adds months to a date while handling month-end edge cases.
   * When the original day exceeds the target month's length,
   * it clamps to the last day of that month.
   *
   * Example: Jan 31 + 1 month = Feb 28/29 (not Mar 2/3)
   */
  private addMonthsToDate(date: Date, monthsToAdd: number): Date {
    const originalDay = date.getDate();
    const result = new Date(date);

    // Move to day 1 to avoid overflow, then set the target month
    result.setDate(1);
    result.setMonth(result.getMonth() + monthsToAdd);

    // Get the last day of the target month
    const lastDayOfMonth = new Date(
      result.getFullYear(),
      result.getMonth() + 1,
      0,
    ).getDate();

    // Use the original day or the last day of the month, whichever is smaller
    result.setDate(Math.min(originalDay, lastDayOfMonth));

    return result;
  }

  async create(userId: string, createDto: CreateCreditCardTransactionDto) {
    const {
      name,
      value,
      date,
      creditCardId,
      categoryId,
      installments = 1,
    } = createDto;

    await this.verifyCreditCardOwnership.validate(userId, creditCardId);

    // Get the card to get the closing day
    const creditCard = await this.creditCardsRepo.findFirst({
      where: { id: creditCardId },
    });

    const transactionDates: Date[] = [];

    // If it is a single purchase (no installments)
    if (installments === 1) {
      const txDate = new Date(date);
      transactionDates.push(txDate);

      await this.creditCardTransactionsRepo.create({
        data: {
          userId,
          creditCardId,
          categoryId,
          name,
          value,
          date: txDate,
          installments: 1,
          currentInstallment: 1,
        },
      });
    } else {
      // Generate installments transactions
      const installmentGroupId = randomUUID();
      const baseInstallmentValue =
        Math.floor((value / installments) * 100) / 100;
      const purchaseDate = new Date(date);

      // Calculate the remainder to add to the last installment
      // This ensures the sum of all installments equals the original value
      const totalOfBaseInstallments = baseInstallmentValue * (installments - 1);
      const lastInstallmentValue =
        Math.round((value - totalOfBaseInstallments) * 100) / 100;

      const transactionsData = [];

      for (let i = 0; i < installments; i++) {
        const installmentDate = this.addMonthsToDate(purchaseDate, i);
        transactionDates.push(installmentDate);

        const isLastInstallment = i === installments - 1;

        transactionsData.push({
          userId,
          creditCardId,
          categoryId,
          name: `${name} (${i + 1}/${installments})`,
          value: isLastInstallment
            ? lastInstallmentValue
            : baseInstallmentValue,
          date: installmentDate,
          installments,
          currentInstallment: i + 1,
          installmentGroupId,
        });
      }

      await this.creditCardTransactionsRepo.createMany({
        data: transactionsData,
      });
    }

    // Update the invoice transactions for the affected months
    if (creditCard) {
      await this.invoiceService.updateInvoicesForTransactionDates(
        userId,
        creditCardId,
        creditCard.closingDay,
        transactionDates,
      );
    }

    return {
      message:
        installments === 1
          ? 'Transação criada com sucesso'
          : `${installments} parcelas criadas com sucesso`,
    };
  }

  async findAllByCardId(
    userId: string,
    creditCardId: string,
    filters?: { month?: number; year?: number },
  ) {
    await this.verifyCreditCardOwnership.validate(userId, creditCardId);

    const where: any = {
      userId,
      creditCardId,
    };

    if (filters?.month && filters?.year) {
      const startDate = new Date(filters.year, filters.month - 1, 1);
      const endDate = new Date(filters.year, filters.month, 0, 23, 59, 59);
      where.date = {
        gte: startDate,
        lte: endDate,
      };
    }

    return this.creditCardTransactionsRepo.findMany({
      where,
      include: {
        category: {
          select: {
            id: true,
            name: true,
            icon: true,
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
    updateDto: UpdateCreditCardTransactionDto,
  ) {
    const transaction = await this.creditCardTransactionsRepo.findFirst({
      where: { id: transactionId, userId },
    });

    if (!transaction) {
      throw new NotFoundException('Transação não encontrada.');
    }

    const oldDate = transaction.date;
    const newDate = updateDto.date ? new Date(updateDto.date) : oldDate;

    // Update the transaction
    const updatedTransaction = await this.creditCardTransactionsRepo.update({
      where: { id: transactionId },
      data: {
        name: updateDto.name,
        value: updateDto.value,
        date: updateDto.date ? new Date(updateDto.date) : undefined,
        categoryId: updateDto.categoryId,
      },
    });

    // Get the card to update the invoices
    const creditCard = await this.creditCardsRepo.findFirst({
      where: { id: transaction.creditCardId },
    });

    if (creditCard) {
      // Update the affected invoices (old and new dates)
      const datesToUpdate = [oldDate];
      if (newDate.getTime() !== oldDate.getTime()) {
        datesToUpdate.push(newDate);
      }

      await this.invoiceService.updateInvoicesForTransactionDates(
        userId,
        transaction.creditCardId,
        creditCard.closingDay,
        datesToUpdate,
      );
    }

    return updatedTransaction;
  }

  async remove(userId: string, transactionId: string) {
    const transaction = await this.creditCardTransactionsRepo.findFirst({
      where: { id: transactionId, userId },
    });

    if (!transaction) {
      throw new NotFoundException('Transação não encontrada.');
    }

    const creditCard = await this.creditCardsRepo.findFirst({
      where: { id: transaction.creditCardId },
    });

    await this.creditCardTransactionsRepo.delete({
      where: { id: transactionId },
    });

    // Update the invoice after deleting
    if (creditCard) {
      await this.invoiceService.updateInvoicesForTransactionDates(
        userId,
        transaction.creditCardId,
        creditCard.closingDay,
        [transaction.date],
      );
    }

    return null;
  }

  async removeAllInstallments(userId: string, installmentGroupId: string) {
    // Find all installments before deleting to get their dates and credit card info
    const installments = await this.creditCardTransactionsRepo.findMany({
      where: {
        userId,
        installmentGroupId,
      },
      select: {
        date: true,
        creditCardId: true,
      },
    });

    if (installments.length === 0) {
      return null;
    }

    const creditCardId = installments[0].creditCardId;
    const transactionDates = installments.map((t) => t.date);

    // Get the credit card to obtain the closing day
    const creditCard = await this.creditCardsRepo.findFirst({
      where: { id: creditCardId },
    });

    // Delete all installments
    await this.creditCardTransactionsRepo.deleteMany({
      where: {
        userId,
        installmentGroupId,
      },
    });

    // Update the invoices for all affected months
    if (creditCard) {
      await this.invoiceService.updateInvoicesForTransactionDates(
        userId,
        creditCardId,
        creditCard.closingDay,
        transactionDates,
      );
    }

    return null;
  }
}
