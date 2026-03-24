import { Injectable } from '@nestjs/common';
import { InvoiceService } from '../../credit-cards/services/invoice.service';
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
    private readonly invoiceService: InvoiceService,
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
    const [cards, categories] = await Promise.all([
      this.creditCardsRepo.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          limit: true,
          closingDay: true,
          dueDay: true,
        },
      }),
      this.categoriesRepo.findMany({
        where: { userId },
        select: { id: true, name: true },
      }),
    ]);

    const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

    return Promise.all(
      cards.map(async (card) => {
        const { transactions } =
          await this.invoiceService.getCurrentInvoiceTransactions(
            userId,
            card.id,
            card.closingDay,
          );

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
          transactions: transactions.map((t) => ({
            name: t.name,
            value: t.value,
            date: t.date,
            installments: t.installments,
            currentInstallment: t.currentInstallment,
            category:
              (t.categoryId && categoryNameById.get(t.categoryId)) || null,
          })),
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
    const now = new Date();

    const periods = Array.from({ length: months }, (_, i) => {
      const date = new Date(
        Date.UTC(now.getFullYear(), now.getMonth() - (months - 1 - i), 1),
      );
      return { month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
    });

    const results = await Promise.all(
      periods.map(async ({ month, year }) => {
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

        return { month, year, income, expense };
      }),
    );

    return results;
  }

  async buildContext(
    userId: string,
    month: number,
    year: number,
  ): Promise<string> {
    const brl = (v: number) =>
      v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const monthName = new Date(Date.UTC(year, month - 1, 1)).toLocaleString(
      'pt-BR',
      { month: 'long', timeZone: 'UTC' },
    );

    const [accounts, creditCards, transactions, categoryBreakdown, trend] =
      await Promise.all([
        this.getBankAccounts(userId),
        this.getCreditCards(userId),
        this.getTransactions(userId, month, year),
        this.getCategoryBreakdown(userId, month, year),
        this.getMonthlyTrend(userId, 3),
      ]);

    // Credit card transactions come directly from getCreditCards (already filtered by invoice period)
    const allCcTransactions = creditCards.flatMap((c) =>
      c.transactions.map((t) => ({ ...t, creditCard: c.name })),
    );

    const totalIncome = transactions
      .filter((t) => t.type === 'INCOME')
      .reduce((s, t) => s + t.value, 0);
    const totalExpense = transactions
      .filter((t) => t.type === 'EXPENSE')
      .reduce((s, t) => s + t.value, 0);
    const totalCcExpense = creditCards.reduce(
      (s, c) => s + c.currentInvoiceTotal,
      0,
    );

    const lines: string[] = [
      `=== CONTEXTO FINANCEIRO — ${monthName.toUpperCase()} ${year} ===`,
      '',
      '--- CONTAS BANCÁRIAS ---',
    ];

    if (accounts.length === 0) {
      lines.push('Nenhuma conta cadastrada.');
    } else {
      for (const a of accounts) {
        lines.push(
          `${a.name} (${a.type}): saldo atual ${brl(a.currentBalance)}`,
        );
      }
      const totalBalance = accounts.reduce((s, a) => s + a.currentBalance, 0);
      lines.push(`Total em contas: ${brl(totalBalance)}`);
    }

    lines.push('', '--- CARTÕES DE CRÉDITO ---');
    if (creditCards.length === 0) {
      lines.push('Nenhum cartão cadastrado.');
    } else {
      for (const c of creditCards) {
        lines.push(
          `${c.name}: limite ${brl(c.limit)} | fatura atual ${brl(c.currentInvoiceTotal)} | disponível ${brl(c.availableLimit)} | fecha dia ${c.closingDay} (compras neste dia já vão para a próxima fatura) | vence dia ${c.dueDay} (o saldo da conta só é debitado neste dia)`,
        );
      }
    }

    lines.push('', `--- TRANSAÇÕES DE CONTAS — ${monthName}/${year} ---`);
    lines.push(
      `Receitas: ${brl(totalIncome)} | Despesas: ${brl(totalExpense)} | Saldo do mês: ${brl(totalIncome - totalExpense)}`,
    );
    if (transactions.length > 0) {
      for (const t of transactions) {
        const cat = t.category ? ` [${t.category}]` : '';
        lines.push(
          `  ${t.type === 'INCOME' ? '+' : '-'} ${brl(t.value)} — ${t.name}${cat}`,
        );
      }
    }

    lines.push('', '--- COMPRAS NO CARTÃO DE CRÉDITO (fatura atual) ---');
    lines.push(`Total: ${brl(totalCcExpense)}`);
    if (allCcTransactions.length > 0) {
      for (const t of allCcTransactions) {
        const cat = t.category ? ` [${t.category}]` : '';
        const inst =
          t.installments > 1
            ? ` (${t.currentInstallment}/${t.installments}x)`
            : '';
        lines.push(
          `  - ${brl(t.value)} — ${t.name}${cat}${inst} (${t.creditCard})`,
        );
      }
    } else {
      lines.push('Nenhuma compra na fatura atual.');
    }

    lines.push('', '--- GASTOS POR CATEGORIA ---');
    if (categoryBreakdown.length > 0) {
      for (const c of categoryBreakdown) {
        lines.push(`  ${c.category}: ${brl(c.total)}`);
      }
    } else {
      lines.push('Sem dados.');
    }

    lines.push('', '--- HISTÓRICO MENSAL (últimos 3 meses) ---');
    for (const t of trend) {
      const mn = new Date(Date.UTC(t.year, t.month - 1, 1)).toLocaleString(
        'pt-BR',
        { month: 'long', timeZone: 'UTC' },
      );
      lines.push(
        `${mn}/${t.year}: receitas ${brl(t.income)} | despesas ${brl(t.expense)} | saldo ${brl(t.income - t.expense)}`,
      );
    }

    lines.push('', '=== FIM DO CONTEXTO ===');
    return lines.join('\n');
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
      const categoryName =
        (t.categoryId && categoryNameById.get(t.categoryId)) || 'Sem categoria';
      breakdown[categoryName] = (breakdown[categoryName] ?? 0) + t.value;
    }

    return Object.entries(breakdown)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  }
}
