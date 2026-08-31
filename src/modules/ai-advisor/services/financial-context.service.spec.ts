/// <reference types="jest" />

import { FinancialContextService } from './financial-context.service';

describe('FinancialContextService', () => {
  const bankAccountsRepo = { findMany: jest.fn() };
  const transactionsRepo = { findMany: jest.fn() };
  const categoriesRepo = { findMany: jest.fn() };
  const creditCardsRepo = { findMany: jest.fn() };
  const creditCardTransactionsRepo = { findMany: jest.fn() };
  const invoiceService = { getCurrentInvoiceTransactions: jest.fn() };

  const service = new FinancialContextService(
    bankAccountsRepo as never,
    transactionsRepo as never,
    categoriesRepo as never,
    creditCardsRepo as never,
    creditCardTransactionsRepo as never,
    invoiceService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('builds a 12-month context with account and card transactions', async () => {
    bankAccountsRepo.findMany.mockResolvedValue([
      {
        name: 'Conta principal',
        type: 'CHECKING',
        initialBalance: 1000,
        sourceTransactions: [],
        destinationTransactions: [],
      },
    ]);
    creditCardsRepo.findMany.mockResolvedValue([
      {
        id: 'card-1',
        name: 'Cartão principal',
        limit: 2000,
        closingDay: 10,
        dueDay: 17,
      },
    ]);
    categoriesRepo.findMany.mockResolvedValue([
      { id: 'food', name: 'Alimentação' },
    ]);
    invoiceService.getCurrentInvoiceTransactions.mockResolvedValue({
      transactions: [],
    });
    transactionsRepo.findMany.mockResolvedValue([
      {
        name: 'Salário',
        value: 1000,
        type: 'INCOME',
        date: new Date('2026-08-05T00:00:00.000Z'),
        categoryId: null,
        creditCardId: null,
      },
      {
        name: 'Pagamento da fatura',
        value: 300,
        type: 'EXPENSE',
        date: new Date('2026-08-17T00:00:00.000Z'),
        categoryId: null,
        creditCardId: 'card-1',
      },
      {
        name: 'Aluguel antigo',
        value: 500,
        type: 'EXPENSE',
        date: new Date('2025-09-10T00:00:00.000Z'),
        categoryId: null,
        creditCardId: null,
      },
    ]);
    creditCardTransactionsRepo.findMany.mockResolvedValue([
      {
        name: 'Supermercado',
        value: 300,
        date: new Date('2026-08-12T00:00:00.000Z'),
        installments: 1,
        currentInstallment: 1,
        categoryId: 'food',
        creditCard: { name: 'Cartão principal' },
      },
    ]);

    const context = await service.buildContext('user-1', 8, 2026);

    expect(context).toContain(
      'HISTÓRICO MENSAL CONSOLIDADO (últimos 12 meses)',
    );
    expect(context).toContain('TODOS OS LANÇAMENTOS DOS ÚLTIMOS 12 MESES');
    expect(context).toContain('Aluguel antigo');
    expect(context).toContain('Supermercado [Alimentação]');
    expect(context).toContain('Pagamento da fatura');
    expect(context).toContain(
      'movimentação de quitação, não somada novamente às despesas',
    );
    expect(context).toContain('Despesas totais: R$ 300,00');

    expect(transactionsRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: {
            gte: new Date('2025-09-01T00:00:00.000Z'),
            lt: new Date('2026-09-01T00:00:00.000Z'),
          },
        }),
      }),
    );
  });

  test('combines card and non-card expenses without counting invoice payments twice', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    transactionsRepo.findMany.mockResolvedValue([
      { value: 1000, type: 'INCOME', creditCardId: null },
      { value: 100, type: 'EXPENSE', creditCardId: null },
      { value: 250, type: 'EXPENSE', creditCardId: 'card-1' },
    ]);
    creditCardTransactionsRepo.findMany.mockResolvedValue([{ value: 250 }]);

    const trend = await service.getMonthlyTrend('user-1');

    expect(trend).toHaveLength(12);
    expect(trend[11]).toEqual({
      month: 8,
      year: 2026,
      income: 1000,
      accountExpense: 100,
      creditCardExpense: 250,
      expense: 350,
    });

    jest.useRealTimers();
  });

  test('combines categories from card and non-card expenses', async () => {
    transactionsRepo.findMany.mockResolvedValue([
      { value: 100, categoryId: 'food' },
    ]);
    creditCardTransactionsRepo.findMany.mockResolvedValue([
      { value: 50, categoryId: 'food' },
    ]);
    categoriesRepo.findMany.mockResolvedValue([
      { id: 'food', name: 'Alimentação' },
    ]);

    await expect(
      service.getCategoryBreakdown('user-1', 8, 2026),
    ).resolves.toEqual([{ category: 'Alimentação', total: 150 }]);
  });
});
