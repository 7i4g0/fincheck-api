import { Injectable } from '@nestjs/common';
import { InvoiceService } from '../../credit-cards/services/invoice.service';
import { BankAccountsRepository } from '../../../shared/database/repositories/bank-accounts.repositories';
import { CategoriesRepository } from '../../../shared/database/repositories/categories.repositories';
import { CreditCardTransactionsRepository } from '../../../shared/database/repositories/credit-card-transactions.repositories';
import { CreditCardsRepository } from '../../../shared/database/repositories/credit-cards.repositories';
import { TransactionsRepository } from '../../../shared/database/repositories/transactions.repositories';

const FINANCIAL_CONTEXT_MONTHS = 12;

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
          creditCardId: true,
        },
        orderBy: { date: 'desc' },
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
      isCreditCardInvoicePayment: t.creditCardId !== null,
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
        const { usedLimit, futureTotal } =
          await this.invoiceService.getOpenChargeTotals(
            userId,
            card.id,
            card.closingDay,
          );

        return {
          name: card.name,
          limit: card.limit,
          closingDay: card.closingDay,
          dueDay: card.dueDay,
          currentInvoiceTotal,
          futureInvoiceTotal: futureTotal,
          availableLimit: card.limit - usedLimit,
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

  async getMonthlyTrend(userId: string, months = FINANCIAL_CONTEXT_MONTHS) {
    const now = new Date();

    const periods = Array.from({ length: months }, (_, i) => {
      const date = new Date(
        Date.UTC(now.getFullYear(), now.getMonth() - (months - 1 - i), 1),
      );
      return { month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
    });

    const results = await Promise.all(
      periods.map(async ({ month, year }) => {
        const [transactions, creditCardTransactions] = await Promise.all([
          this.transactionsRepo.findMany({
            where: {
              userId,
              date: {
                gte: new Date(Date.UTC(year, month - 1, 1)),
                lt: new Date(Date.UTC(year, month, 1)),
              },
              type: { in: ['INCOME', 'EXPENSE'] },
            },
            select: { value: true, type: true, creditCardId: true },
          }),
          this.creditCardTransactionsRepo.findMany({
            where: {
              userId,
              date: {
                gte: new Date(Date.UTC(year, month - 1, 1)),
                lt: new Date(Date.UTC(year, month, 1)),
              },
            },
            select: { value: true },
          }),
        ]);

        const income = transactions
          .filter((t) => t.type === 'INCOME')
          .reduce((sum, t) => sum + t.value, 0);
        const accountExpense = transactions
          .filter((t) => t.type === 'EXPENSE' && t.creditCardId === null)
          .reduce((sum, t) => sum + t.value, 0);
        const creditCardExpense = creditCardTransactions.reduce(
          (sum, t) => sum + t.value,
          0,
        );
        const expense = accountExpense + creditCardExpense;

        return {
          month,
          year,
          income,
          expense,
          accountExpense,
          creditCardExpense,
        };
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

    const [accounts, creditCards, history] = await Promise.all([
      this.getBankAccounts(userId),
      this.getCreditCards(userId),
      this.getFinancialHistory(userId, month, year, FINANCIAL_CONTEXT_MONTHS),
    ]);

    const transactions = history.filter(
      (transaction) =>
        transaction.date.getUTCMonth() + 1 === month &&
        transaction.date.getUTCFullYear() === year,
    );

    // Credit card transactions come directly from getCreditCards (already filtered by invoice period)
    const allCcTransactions = creditCards.flatMap((c) =>
      c.transactions.map((t) => ({ ...t, creditCard: c.name })),
    );

    const totalIncome = transactions
      .filter((t) => t.type === 'INCOME' && t.source === 'BANK_ACCOUNT')
      .reduce((s, t) => s + t.value, 0);
    const totalAccountExpense = transactions
      .filter(
        (t) =>
          t.type === 'EXPENSE' &&
          t.source === 'BANK_ACCOUNT' &&
          !t.isCreditCardInvoicePayment,
      )
      .reduce((s, t) => s + t.value, 0);
    const totalCreditCardExpense = transactions
      .filter((t) => t.source === 'CREDIT_CARD')
      .reduce((s, t) => s + t.value, 0);
    const totalExpense = totalAccountExpense + totalCreditCardExpense;
    const totalInvoicePayments = transactions
      .filter((t) => t.isCreditCardInvoicePayment)
      .reduce((s, t) => s + t.value, 0);
    const totalCcExpense = creditCards.reduce(
      (s, c) => s + c.currentInvoiceTotal,
      0,
    );

    const categoryBreakdown = this.buildCategoryBreakdown(transactions);
    const trend = this.buildMonthlyTrend(
      history,
      month,
      year,
      FINANCIAL_CONTEXT_MONTHS,
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
          `${c.name}: limite ${brl(c.limit)} | fatura atual ${brl(c.currentInvoiceTotal)} | lançamentos futuros ${brl(c.futureInvoiceTotal)} | disponível ${brl(c.availableLimit)} (o disponível já desconta a fatura atual e as parcelas futuras) | fecha dia ${c.closingDay} (compras neste dia já vão para a próxima fatura) | vence dia ${c.dueDay} (o saldo da conta só é debitado neste dia)`,
        );
      }
    }

    lines.push('', `--- VISÃO CONSOLIDADA — ${monthName}/${year} ---`);
    lines.push(
      `Receitas: ${brl(totalIncome)} | Despesas fora do cartão: ${brl(totalAccountExpense)} | Compras no cartão: ${brl(totalCreditCardExpense)} | Despesas totais: ${brl(totalExpense)} | Resultado: ${brl(totalIncome - totalExpense)}`,
    );
    if (totalInvoicePayments > 0) {
      lines.push(
        `Pagamentos de fatura no período: ${brl(totalInvoicePayments)} (movimentação de quitação, não somada novamente às despesas para evitar duplicidade).`,
      );
    }
    if (transactions.length > 0) {
      for (const t of transactions) {
        const cat = t.category ? ` [${t.category}]` : '';
        const origin =
          t.source === 'CREDIT_CARD'
            ? `cartão ${t.creditCard}`
            : t.isCreditCardInvoicePayment
              ? 'pagamento de fatura'
              : 'conta';
        const inst =
          t.source === 'CREDIT_CARD' && t.installments > 1
            ? ` (${t.currentInstallment}/${t.installments}x)`
            : '';
        const sign =
          t.type === 'INCOME' ? '+' : t.type === 'TRANSFER' ? '↔' : '-';
        lines.push(
          `  ${sign} ${brl(t.value)} — ${t.name}${cat}${inst} (${origin})`,
        );
      }
    } else {
      lines.push('Nenhum lançamento no mês.');
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

    lines.push(
      '',
      `--- HISTÓRICO MENSAL CONSOLIDADO (últimos ${FINANCIAL_CONTEXT_MONTHS} meses) ---`,
    );
    for (const t of trend) {
      const mn = new Date(Date.UTC(t.year, t.month - 1, 1)).toLocaleString(
        'pt-BR',
        { month: 'long', timeZone: 'UTC' },
      );
      lines.push(
        `${mn}/${t.year}: receitas ${brl(t.income)} | despesas fora do cartão ${brl(t.accountExpense)} | cartão ${brl(t.creditCardExpense)} | despesas totais ${brl(t.expense)} | resultado ${brl(t.income - t.expense)}`,
      );
    }

    lines.push(
      '',
      `--- TODOS OS LANÇAMENTOS DOS ÚLTIMOS ${FINANCIAL_CONTEXT_MONTHS} MESES ---`,
    );
    if (history.length === 0) {
      lines.push('Nenhum lançamento no período.');
    } else {
      for (const t of history) {
        const date = t.date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
        const cat = t.category ? ` [${t.category}]` : '';
        const origin =
          t.source === 'CREDIT_CARD'
            ? `cartão ${t.creditCard}`
            : t.isCreditCardInvoicePayment
              ? 'pagamento de fatura'
              : 'conta';
        const inst =
          t.source === 'CREDIT_CARD' && t.installments > 1
            ? ` (${t.currentInstallment}/${t.installments}x)`
            : '';
        lines.push(
          `  ${date} | ${t.type} | ${brl(t.value)} | ${t.name}${cat}${inst} | ${origin}`,
        );
      }
    }

    lines.push('', '=== FIM DO CONTEXTO ===');
    return lines.join('\n');
  }

  async getCategoryBreakdown(userId: string, month: number, year: number) {
    const [transactions, creditCardTransactions, categories] =
      await Promise.all([
        this.transactionsRepo.findMany({
          where: {
            userId,
            type: 'EXPENSE',
            creditCardId: null,
            date: {
              gte: new Date(Date.UTC(year, month - 1, 1)),
              lt: new Date(Date.UTC(year, month, 1)),
            },
          },
          select: { value: true, categoryId: true },
        }),
        this.creditCardTransactionsRepo.findMany({
          where: {
            userId,
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
    for (const t of [...transactions, ...creditCardTransactions]) {
      const categoryName =
        (t.categoryId && categoryNameById.get(t.categoryId)) || 'Sem categoria';
      breakdown[categoryName] = (breakdown[categoryName] ?? 0) + t.value;
    }

    return Object.entries(breakdown)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  }

  private async getFinancialHistory(
    userId: string,
    month: number,
    year: number,
    months: number,
  ) {
    const start = new Date(Date.UTC(year, month - months, 1));
    const end = new Date(Date.UTC(year, month, 1));

    const [transactions, creditCardTransactions, categories] =
      await Promise.all([
        this.transactionsRepo.findMany({
          where: { userId, date: { gte: start, lt: end } },
          select: {
            name: true,
            value: true,
            type: true,
            date: true,
            categoryId: true,
            creditCardId: true,
          },
        }),
        this.creditCardTransactionsRepo.findMany({
          where: { userId, date: { gte: start, lt: end } },
          select: {
            name: true,
            value: true,
            date: true,
            installments: true,
            currentInstallment: true,
            categoryId: true,
            creditCard: { select: { name: true } },
          },
        }),
        this.categoriesRepo.findMany({
          where: { userId },
          select: { id: true, name: true },
        }),
      ]);

    const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

    return [
      ...transactions.map((transaction) => ({
        ...transaction,
        source: 'BANK_ACCOUNT' as const,
        category:
          (transaction.categoryId &&
            categoryNameById.get(transaction.categoryId)) ||
          null,
        isCreditCardInvoicePayment: transaction.creditCardId !== null,
        creditCard: null,
        installments: 1,
        currentInstallment: 1,
      })),
      ...creditCardTransactions.map((transaction) => ({
        ...transaction,
        type: 'EXPENSE' as const,
        source: 'CREDIT_CARD' as const,
        category:
          (transaction.categoryId &&
            categoryNameById.get(transaction.categoryId)) ||
          null,
        isCreditCardInvoicePayment: false,
        creditCard: transaction.creditCard.name,
        creditCardId: null,
      })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  private buildCategoryBreakdown(
    transactions: Awaited<
      ReturnType<FinancialContextService['getFinancialHistory']>
    >,
  ) {
    const breakdown: Record<string, number> = {};

    for (const transaction of transactions) {
      if (
        transaction.type !== 'EXPENSE' ||
        transaction.isCreditCardInvoicePayment
      ) {
        continue;
      }

      const category = transaction.category || 'Sem categoria';
      breakdown[category] = (breakdown[category] ?? 0) + transaction.value;
    }

    return Object.entries(breakdown)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  }

  private buildMonthlyTrend(
    history: Awaited<
      ReturnType<FinancialContextService['getFinancialHistory']>
    >,
    month: number,
    year: number,
    months: number,
  ) {
    return Array.from({ length: months }, (_, index) => {
      const period = new Date(Date.UTC(year, month - months + index, 1));
      const periodMonth = period.getUTCMonth() + 1;
      const periodYear = period.getUTCFullYear();
      const transactions = history.filter(
        (transaction) =>
          transaction.date.getUTCMonth() + 1 === periodMonth &&
          transaction.date.getUTCFullYear() === periodYear,
      );
      const income = transactions
        .filter(
          (transaction) =>
            transaction.type === 'INCOME' &&
            transaction.source === 'BANK_ACCOUNT',
        )
        .reduce((sum, transaction) => sum + transaction.value, 0);
      const accountExpense = transactions
        .filter(
          (transaction) =>
            transaction.type === 'EXPENSE' &&
            transaction.source === 'BANK_ACCOUNT' &&
            !transaction.isCreditCardInvoicePayment,
        )
        .reduce((sum, transaction) => sum + transaction.value, 0);
      const creditCardExpense = transactions
        .filter((transaction) => transaction.source === 'CREDIT_CARD')
        .reduce((sum, transaction) => sum + transaction.value, 0);

      return {
        month: periodMonth,
        year: periodYear,
        income,
        accountExpense,
        creditCardExpense,
        expense: accountExpense + creditCardExpense,
      };
    });
  }
}
