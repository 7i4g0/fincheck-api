import { CreditCardTransactionsRepository } from '@/shared/database/repositories/credit-card-transactions.repositories';
import { CreditCardsRepository } from '@/shared/database/repositories/credit-cards.repositories';
import { TransactionsRepository } from '@/shared/database/repositories/transactions.repositories';
import { Injectable } from '@nestjs/common';

@Injectable()
export class InvoiceService {
  constructor(
    private readonly transactionsRepo: TransactionsRepository,
    private readonly creditCardsRepo: CreditCardsRepository,
    private readonly creditCardTransactionsRepo: CreditCardTransactionsRepository,
  ) {}

  /**
   * Calculates which invoice (month/year) a transaction belongs to based on the closing day
   */
  calculateInvoicePeriod(
    transactionDate: Date,
    closingDay: number,
  ): { month: number; year: number } {
    const txDay = transactionDate.getDate();
    let month = transactionDate.getMonth() + 1;
    let year = transactionDate.getFullYear();

    // If the transaction is after the closing day, it goes to the next invoice
    if (txDay > closingDay) {
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }

    return { month, year };
  }

  /**
   * Calculates the date range for an invoice period.
   * Returns the closing date (end of period) and previous closing date (end of previous period).
   *
   * The range is: previousClosingDate < transaction.date <= closingDate
   * Both dates are set to 23:59:59 so that:
   * - closingDate includes all transactions up to end of closing day
   * - previousClosingDate (with gt:) excludes transactions from the previous closing day
   */
  calculateInvoiceDateRange(
    invoiceMonth: number,
    invoiceYear: number,
    closingDay: number,
  ): { closingDate: Date; previousClosingDate: Date } {
    const closingDate = new Date(
      invoiceYear,
      invoiceMonth - 1,
      closingDay,
      23,
      59,
      59,
    );
    const previousClosingDate = new Date(
      invoiceYear,
      invoiceMonth - 2,
      closingDay,
      23,
      59,
      59,
    );

    return { closingDate, previousClosingDate };
  }

  /**
   * Fetches all credit card transactions for a specific invoice period.
   */
  async getInvoiceTransactions(
    userId: string,
    creditCardId: string,
    invoiceMonth: number,
    invoiceYear: number,
    closingDay: number,
    includeCategory = false,
  ) {
    const { closingDate, previousClosingDate } = this.calculateInvoiceDateRange(
      invoiceMonth,
      invoiceYear,
      closingDay,
    );

    const include = includeCategory
      ? {
          category: {
            select: {
              id: true,
              name: true,
              icon: true,
            },
          },
        }
      : undefined;

    const transactions = await this.creditCardTransactionsRepo.findMany({
      where: {
        creditCardId,
        userId,
        date: {
          gt: previousClosingDate,
          lte: closingDate,
        },
      },
      include,
      orderBy: {
        date: 'desc',
      },
    });

    return { transactions, closingDate, previousClosingDate };
  }

  /**
   * Updates or creates the invoice transaction for a card in a specific month/year
   */
  async updateInvoiceTransaction(
    userId: string,
    creditCardId: string,
    invoiceMonth: number,
    invoiceYear: number,
  ) {
    // Get the card to get data
    const creditCard = await this.creditCardsRepo.findFirst({
      where: { id: creditCardId, userId },
    });

    if (!creditCard || !creditCard.defaultBankAccountId) {
      // If there is no default account, do not create the invoice transaction
      return null;
    }

    // Get all transactions for this invoice using the shared method
    const { transactions } = await this.getInvoiceTransactions(
      userId,
      creditCardId,
      invoiceMonth,
      invoiceYear,
      creditCard.closingDay,
    );

    const total = transactions.reduce((acc, t) => acc + t.value, 0);

    // Due date of the invoice
    const dueDate = new Date(invoiceYear, invoiceMonth - 1, creditCard.dueDay);

    if (total === 0) {
      // If the total is zero, try to delete the invoice transaction if it exists
      const existingInvoice = await this.transactionsRepo.findFirst({
        where: {
          creditCardId,
          invoiceMonth,
          invoiceYear,
        },
      });

      if (existingInvoice) {
        await this.transactionsRepo.delete({
          where: { id: existingInvoice.id },
        });
      }

      return null;
    }

    // Create or update the invoice transaction
    // Usamos upsert com a constraint única (creditCardId, invoiceMonth, invoiceYear)
    const invoiceTransaction = await this.transactionsRepo.upsert({
      where: {
        creditCardId_invoiceMonth_invoiceYear: {
          creditCardId,
          invoiceMonth,
          invoiceYear,
        },
      },
      update: {
        value: total,
        date: dueDate,
        name: `Fatura ${creditCard.name} - ${invoiceMonth.toString().padStart(2, '0')}/${invoiceYear}`,
      },
      create: {
        userId,
        bankAccountId: creditCard.defaultBankAccountId,
        creditCardId,
        invoiceMonth,
        invoiceYear,
        name: `Fatura ${creditCard.name} - ${invoiceMonth.toString().padStart(2, '0')}/${invoiceYear}`,
        value: total,
        date: dueDate,
        type: 'EXPENSE',
      },
    });

    return invoiceTransaction;
  }

  /**
   * Updates all invoices affected by a transaction
   * (useful when the transaction has installments in multiple months)
   */
  async updateInvoicesForTransactionDates(
    userId: string,
    creditCardId: string,
    closingDay: number,
    dates: Date[],
  ) {
    // Calculate which invoices are affected
    const invoicePeriods = new Set<string>();

    for (const date of dates) {
      const { month, year } = this.calculateInvoicePeriod(date, closingDay);
      invoicePeriods.add(`${month}-${year}`);
    }

    // Update each invoice
    for (const period of invoicePeriods) {
      const [month, year] = period.split('-').map(Number);
      await this.updateInvoiceTransaction(userId, creditCardId, month, year);
    }
  }
}
