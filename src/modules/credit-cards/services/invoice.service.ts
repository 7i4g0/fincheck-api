import { CreditCardTransactionsRepository } from '../../../shared/database/repositories/credit-card-transactions.repositories';
import { CreditCardsRepository } from '../../../shared/database/repositories/credit-cards.repositories';
import { TransactionsRepository } from '../../../shared/database/repositories/transactions.repositories';
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
  /**
   * Interprets a calendar day (YYYY-MM-DD) as UTC noon so the same date stays
   * in the same invoice whether the server runs in UTC or America/Sao_Paulo.
   */
  parseCalendarDate(value: string): Date {
    return new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
  }

  calculateInvoicePeriod(
    transactionDate: Date,
    closingDay: number,
  ): { month: number; year: number } {
    const txDay = transactionDate.getUTCDate();
    let month = transactionDate.getUTCMonth() + 1;
    let year = transactionDate.getUTCFullYear();

    // If the transaction is on or after the closing day, it goes to the next invoice
    if (txDay >= closingDay) {
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }

    return { month, year };
  }

  /**
   * Calculates the due date for an invoice.
   * When dueDay is less than or equal to closingDay, the due date is in the same month.
   * When dueDay is greater than closingDay, the due date is in the following month.
   *
   * Example: closingDay=25, dueDay=10
   * - Invoice closes on Jan 25
   * - Due date is Feb 10 (next month, since 10 < 25)
   *
   * Example: closingDay=10, dueDay=25
   * - Invoice closes on Jan 10
   * - Due date is Jan 25 (same month, since 25 > 10)
   */
  calculateDueDate(
    invoiceMonth: number,
    invoiceYear: number,
    closingDay: number,
    dueDay: number,
  ): Date {
    let dueMonth = invoiceMonth;
    let dueYear = invoiceYear;

    // If dueDay is before or equal to closingDay, the due date is in the next month
    if (dueDay <= closingDay) {
      dueMonth++;
      if (dueMonth > 12) {
        dueMonth = 1;
        dueYear++;
      }
    }

    // Use UTC noon to avoid timezone shifts causing the date to appear
    // as the previous day in timezones behind UTC (e.g. BRT = UTC-3).
    return new Date(Date.UTC(dueYear, dueMonth - 1, dueDay, 12, 0, 0));
  }

  /**
   * Calculates the date range for an invoice period.
   *
   * The range is: invoiceStart <= transaction.date < invoiceEnd
   * - invoiceStart: closing day of the previous month (inclusive — purchases on this day open the invoice)
   * - invoiceEnd:   closing day of the current month  (exclusive — purchases on this day open the next invoice)
   *
   * e.g. closingDay=2, invoiceMonth=4 (April):
   *   invoiceStart = March 2 00:00:00 UTC  (gte)
   *   invoiceEnd   = April 2 00:00:00 UTC  (lt)
   */
  calculateInvoiceDateRange(
    invoiceMonth: number,
    invoiceYear: number,
    closingDay: number,
  ): { invoiceStart: Date; invoiceEnd: Date } {
    const invoiceStart = new Date(
      Date.UTC(invoiceYear, invoiceMonth - 2, closingDay, 0, 0, 0),
    );
    const invoiceEnd = new Date(
      Date.UTC(invoiceYear, invoiceMonth - 1, closingDay, 0, 0, 0),
    );

    return { invoiceStart, invoiceEnd };
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
    const { invoiceStart, invoiceEnd } = this.calculateInvoiceDateRange(
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
          gte: invoiceStart,
          lt: invoiceEnd,
        },
      },
      include,
      orderBy: {
        date: 'desc',
      },
    });

    return { transactions, invoiceStart, invoiceEnd };
  }

  /**
   * Fetches all credit card transactions for the currently open invoice period.
   * Determines the current period from today's date and the card's closing day.
   */
  async getCurrentInvoiceTransactions(
    userId: string,
    creditCardId: string,
    closingDay: number,
    includeCategory = false,
  ) {
    const today = new Date();
    const { month, year } = this.calculateInvoicePeriod(today, closingDay);
    return this.getInvoiceTransactions(
      userId,
      creditCardId,
      month,
      year,
      closingDay,
      includeCategory,
    );
  }

  /**
   * Current invoice plus later installments: both occupy the card limit
   * until they are billed and paid.
   */
  async getOpenChargeTotals(
    userId: string,
    creditCardId: string,
    closingDay: number,
  ): Promise<{
    currentInvoiceTotal: number;
    futureTotal: number;
    usedLimit: number;
  }> {
    const today = new Date();
    const { month, year } = this.calculateInvoicePeriod(today, closingDay);
    const { invoiceStart, invoiceEnd } = this.calculateInvoiceDateRange(
      month,
      year,
      closingDay,
    );

    const transactions = await this.creditCardTransactionsRepo.findMany({
      where: {
        creditCardId,
        userId,
        date: { gte: invoiceStart },
      },
      select: { value: true, date: true },
    });

    let currentInvoiceTotal = 0;
    let futureTotal = 0;

    for (const transaction of transactions) {
      if (transaction.date < invoiceEnd) {
        currentInvoiceTotal += transaction.value;
      } else {
        futureTotal += transaction.value;
      }
    }

    return {
      currentInvoiceTotal,
      futureTotal,
      usedLimit: currentInvoiceTotal + futureTotal,
    };
  }

  /**
   * Fetches invoice transactions for a card, resolving the closingDay automatically.
   * Convenience wrapper for use by other modules.
   */
  async getInvoiceTransactionsForCard(
    userId: string,
    creditCardId: string,
    invoiceMonth: number,
    invoiceYear: number,
  ) {
    const card = await this.creditCardsRepo.findFirst({
      where: { id: creditCardId, userId },
    });
    if (!card) return [];
    const { transactions } = await this.getInvoiceTransactions(
      userId,
      creditCardId,
      invoiceMonth,
      invoiceYear,
      card.closingDay,
    );
    return transactions;
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
    const dueDate = this.calculateDueDate(
      invoiceMonth,
      invoiceYear,
      creditCard.closingDay,
      creditCard.dueDay,
    );

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
