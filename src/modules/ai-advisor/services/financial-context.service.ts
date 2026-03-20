import { Injectable } from '@nestjs/common';
import { BankAccountsRepository } from '../../../shared/database/repositories/bank-accounts.repositories';
import { CategoriesRepository } from '../../../shared/database/repositories/categories.repositories';
import { CreditCardTransactionsRepository } from '../../../shared/database/repositories/credit-card-transactions.repositories';
import { CreditCardsRepository } from '../../../shared/database/repositories/credit-cards.repositories';
import { TransactionsRepository } from '../../../shared/database/repositories/transactions.repositories';

@Injectable()
export class FinancialContextService {
  constructor(
    private readonly bankAccountsRepo: BankAccountsRepository,
    private readonly transactionsRepo: TransactionsRepository,
    private readonly categoriesRepo: CategoriesRepository,
    private readonly creditCardsRepo: CreditCardsRepository,
    private readonly creditCardTransactionsRepo: CreditCardTransactionsRepository,
  ) {}

  async getBankAccounts(userId: string) {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const accounts = await this.bankAccountsRepo.findMany({
      where: { userId },
      include: {
        sourceTransactions: {
          select: { type: true, value: true, date: true },
        },
        destinationTransactions: {
          select: { type: true, value: true, date: true },
        },
      },
    });

    return accounts.map((account) => {
      const sourceBalance = account.sourceTransactions
        .filter((t) => new Date(t.date) <= today)
        .reduce((acc, t) => {
          if (t.type === 'INCOME') return acc + t.value;
          if (t.type === 'EXPENSE') return acc - t.value;
          if (t.type === 'TRANSFER') return acc - t.value;
          return acc;
        }, 0);

      const destinationBalance = account.destinationTransactions
        .filter((t) => new Date(t.date) <= today)
        .reduce((acc, t) => {
          if (t.type === 'TRANSFER') return acc + t.value;
          return acc;
        }, 0);

      const currentBalance =
        account.initialBalance + sourceBalance + destinationBalance;

      return {
        name: account.name,
        type: account.type,
        currentBalance,
      };
    });
  }

  async getTransactions(
    userId: string,
    month: number,
    year: number,
    type?: 'INCOME' | 'EXPENSE' | 'TRANSFER',
  ) {
    const [transactions, categories] = await Promise.all([
      this.transactionsRepo.findMany({
        where: {
          userId,
          type: type ?? undefined,
          date: {
            gte: new Date(Date.UTC(year, month - 1, 1)),
            lt: new Date(Date.UTC(year, month, 1)),
          },
        },
        select: {
          name: true,
          value: true,
          type: true,
          date: true,
          categoryId: true,
        },
        orderBy: { date: 'desc' },
        take: 100,
      }),
      this.categoriesRepo.findMany({
        where: { userId },
        select: { id: true, name: true },
      }),
    ]);

    const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

    return transactions.map((t) => ({
      name: t.name,
      value: t.value,
      type: t.type,
      date: t.date,
      category: (t.categoryId && categoryNameById.get(t.categoryId)) || null,
    }));
  }

  async getCreditCardTransactions(
    userId: string,
    month: number,
    year: number,
    creditCardId?: string,
  ) {
    const [transactions, categories] = await Promise.all([
      this.creditCardTransactionsRepo.findMany({
        where: {
          userId,
          creditCardId: creditCardId ?? undefined,
          date: {
            gte: new Date(Date.UTC(year, month - 1, 1)),
            lt: new Date(Date.UTC(year, month, 1)),
          },
        },
        select: {
          name: true,
          value: true,
          date: true,
          installments: true,
          currentInstallment: true,
          categoryId: true,
          creditCard: { select: { name: true } },
        },
        orderBy: { date: 'desc' },
        take: 100,
      }),
      this.categoriesRepo.findMany({
        where: { userId },
        select: { id: true, name: true },
      }),
    ]);

    const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

    return transactions.map((t) => ({
      name: t.name,
      value: t.value,
      date: t.date,
      installments: t.installments,
      currentInstallment: t.currentInstallment,
      category: (t.categoryId && categoryNameById.get(t.categoryId)) || null,
      creditCard: t.creditCard.name,
    }));
  }

  async getCreditCards(userId: string) {
    const today = new Date();
    const todayDay = today.getUTCDate();

    const cards = await this.creditCardsRepo.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        limit: true,
        closingDay: true,
        dueDay: true,
      },
    });

    return Promise.all(
      cards.map(async (card) => {
        // Determine the current invoice period based on closing day
        // If today is before closing day: invoice covers last month's closing to this month's closing
        // If today is on/after closing day: invoice covers this month's closing to next month's closing
        let invoiceStart: Date;
        let invoiceEnd: Date;

        if (todayDay < card.closingDay) {
          invoiceStart = new Date(
            Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, card.closingDay),
          );
          invoiceEnd = new Date(
            Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), card.closingDay),
          );
        } else {
          invoiceStart = new Date(
            Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), card.closingDay),
          );
          invoiceEnd = new Date(
            Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, card.closingDay),
          );
        }

        const transactions = await this.creditCardTransactionsRepo.findMany({
          where: {
            userId,
            creditCardId: card.id,
            date: { gte: invoiceStart, lt: invoiceEnd },
          },
          select: { value: true },
        });

        const currentInvoiceTotal = transactions.reduce(
          (sum, t) => sum + t.value,
          0,
        );

        return {
          name: card.name,
          limit: card.limit,
          closingDay: card.closingDay,
          dueDay: card.dueDay,
          currentInvoiceTotal,
          availableLimit: card.limit - currentInvoiceTotal,
        };
      }),
    );
  }

  async getCategories(userId: string) {
    return this.categoriesRepo.findMany({
      where: { userId },
      select: {
        name: true,
        type: true,
        icon: true,
        estimatedValue: true,
      },
    });
  }

  async getMonthlyTrend(userId: string, months = 3) {
    const results: { month: number; year: number; income: number; expense: number }[] = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
      const month = date.getUTCMonth() + 1;
      const year = date.getUTCFullYear();

      const transactions = await this.transactionsRepo.findMany({
        where: {
          userId,
          date: {
            gte: new Date(Date.UTC(year, month - 1, 1)),
            lt: new Date(Date.UTC(year, month, 1)),
          },
          type: { in: ['INCOME', 'EXPENSE'] },
        },
        select: { value: true, type: true },
      });

      const income = transactions
        .filter((t) => t.type === 'INCOME')
        .reduce((sum, t) => sum + t.value, 0);
      const expense = transactions
        .filter((t) => t.type === 'EXPENSE')
        .reduce((sum, t) => sum + t.value, 0);

      results.push({ month, year, income, expense });
    }

    return results;
  }

  async getCategoryBreakdown(userId: string, month: number, year: number) {
    const [transactions, categories] = await Promise.all([
      this.transactionsRepo.findMany({
        where: {
          userId,
          type: 'EXPENSE',
          date: {
            gte: new Date(Date.UTC(year, month - 1, 1)),
            lt: new Date(Date.UTC(year, month, 1)),
          },
        },
        select: { value: true, categoryId: true },
      }),
      this.categoriesRepo.findMany({
        where: { userId },
        select: { id: true, name: true },
      }),
    ]);

    const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

    const breakdown: Record<string, number> = {};
    for (const t of transactions) {
      const categoryName = (t.categoryId && categoryNameById.get(t.categoryId)) || 'Sem categoria';
      breakdown[categoryName] = (breakdown[categoryName] ?? 0) + t.value;
    }

    return Object.entries(breakdown)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  }
}
