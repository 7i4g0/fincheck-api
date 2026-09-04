/// <reference types="jest" />

jest.mock('../../../shared/config/env', () => ({
  env: { anthropicApiKey: 'test-key', anthropicModel: 'claude-haiku-4-5' },
}));

import { InvoiceService } from '../../credit-cards/services/invoice.service';
import { InvoiceImportService } from './invoice-import.service';

describe('InvoiceImportService category suggestions', () => {
  const categoriesRepo = { findMany: jest.fn() };
  const creditCardsRepo = { findFirst: jest.fn() };
  const creditCardTransactionsRepo = {
    findMany: jest.fn(),
    createMany: jest.fn(),
  };
  const invoiceService = {
    parseCalendarDate: jest.fn(
      (value: string) => new Date(`${value}T12:00:00.000Z`),
    ),
    updateInvoicesForTransactionDates: jest.fn(),
  };
  const parserRegistry = { findParser: jest.fn() };
  const usageTracking = { track: jest.fn() };

  let service: InvoiceImportService;
  let createMessage: jest.Mock;

  const categories = [
    { id: 'cat-market', name: 'Mercado' },
    { id: 'cat-health', name: 'Saúde' },
    { id: 'cat-fun', name: 'Lazer' },
  ];

  function aiResponse(text: string) {
    return {
      content: [{ type: 'text', text }],
      usage: { input_tokens: 100, output_tokens: 20 },
      stop_reason: 'end_turn',
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);

    service = new InvoiceImportService(
      categoriesRepo as never,
      creditCardsRepo as never,
      creditCardTransactionsRepo as never,
      invoiceService as never,
      parserRegistry as never,
      usageTracking as never,
    );

    createMessage = jest.fn();
    service['anthropic'].messages.create = createMessage as never;

    categoriesRepo.findMany.mockResolvedValue(categories);
    usageTracking.track.mockResolvedValue(undefined);
  });

  test('maps transaction names to category ids using position numbers', async () => {
    createMessage.mockResolvedValue(aiResponse('{"1":1,"2":2}'));

    await expect(
      service.suggestCategories('user-1', [
        'Supermercado Bairro',
        'Drogaria Central',
      ]),
    ).resolves.toEqual({
      'Supermercado Bairro': 'cat-market',
      'Drogaria Central': 'cat-health',
    });
  });

  test('splits long statements into batches and merges the results', async () => {
    const names = Array.from({ length: 95 }, (_, i) => `Merchant ${i + 1}`);

    createMessage.mockImplementation(({ messages }) => {
      const prompt = messages[0].content as string;
      const batchSize = prompt
        .split('Transactions (number. name):')[1]
        .trim()
        .split('\n').length;

      const pairs = Array.from(
        { length: batchSize },
        (_, i) => `"${i + 1}":1`,
      ).join(',');

      return Promise.resolve(aiResponse(`{${pairs}}`));
    });

    const mapping = await service.suggestCategories('user-1', names);

    expect(createMessage).toHaveBeenCalledTimes(3);
    expect(Object.keys(mapping)).toHaveLength(95);
    expect(mapping['Merchant 95']).toBe('cat-market');
  });

  test('deduplicates repeated merchant names before asking the model', async () => {
    createMessage.mockResolvedValue(aiResponse('{"1":1}'));

    const mapping = await service.suggestCategories('user-1', [
      'Lanchonete - Rede',
      'Lanchonete - Rede',
      'Lanchonete - Rede',
    ]);

    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(mapping).toEqual({ 'Lanchonete - Rede': 'cat-market' });
  });

  test('keeps the entries a truncated response managed to emit', async () => {
    createMessage.mockResolvedValue(aiResponse('{"1":1,"2":3,"3":'));

    const mapping = await service.suggestCategories('user-1', ['A', 'B', 'C']);

    expect(mapping).toEqual({ A: 'cat-market', B: 'cat-fun' });
  });

  test('accepts responses wrapped in markdown fences', async () => {
    createMessage.mockResolvedValue(aiResponse('```json\n{"1":2}\n```'));

    await expect(
      service.suggestCategories('user-1', ['Farmacia']),
    ).resolves.toEqual({
      Farmacia: 'cat-health',
    });
  });

  test('ignores category numbers outside the available range', async () => {
    createMessage.mockResolvedValue(aiResponse('{"1":99,"2":2}'));

    await expect(
      service.suggestCategories('user-1', ['A', 'B']),
    ).resolves.toEqual({
      B: 'cat-health',
    });
  });

  test('tracks token usage across every batch', async () => {
    const names = Array.from({ length: 45 }, (_, i) => `Merchant ${i + 1}`);
    createMessage.mockResolvedValue(aiResponse('{"1":1}'));

    await service.suggestCategories('user-1', names);

    expect(usageTracking.track).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 200, outputTokens: 40 }),
    );
  });

  test('skips the model entirely when the user has no expense categories', async () => {
    categoriesRepo.findMany.mockResolvedValue([]);

    await expect(
      service.suggestCategories('user-1', ['Netflix']),
    ).resolves.toEqual({});
    expect(createMessage).not.toHaveBeenCalled();
  });

  test('persists a refund as a negative credit card transaction', async () => {
    creditCardsRepo.findFirst.mockResolvedValue({
      id: 'card-1',
      closingDay: 2,
    });
    creditCardTransactionsRepo.createMany.mockResolvedValue({ count: 1 });
    invoiceService.updateInvoicesForTransactionDates.mockResolvedValue(
      undefined,
    );

    await service.confirmImport('user-1', {
      creditCardId: 'card-1',
      transactions: [
        {
          name: 'Estorno: Assinatura Exemplo',
          value: -25,
          date: '2026-07-04',
        },
      ],
    });

    expect(creditCardTransactionsRepo.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          name: 'Estorno: Assinatura Exemplo',
          value: -25,
          categoryId: null,
        }),
      ],
    });
  });
});

describe('InvoiceImportService matching window', () => {
  const creditCardsRepo = { findFirst: jest.fn() };
  const creditCardTransactionsRepo = { findMany: jest.fn() };
  const invoiceService = new InvoiceService(
    {} as never,
    {} as never,
    {} as never,
  );

  const service = new InvoiceImportService(
    { findMany: jest.fn() } as never,
    creditCardsRepo as never,
    creditCardTransactionsRepo as never,
    invoiceService,
    { findParser: jest.fn() } as never,
    { track: jest.fn() } as never,
  );

  test('looks up existing launches only in the invoice period of the file', async () => {
    creditCardsRepo.findFirst.mockResolvedValue({
      id: 'card-1',
      closingDay: 2,
    });
    creditCardTransactionsRepo.findMany.mockResolvedValue([]);

    await service.matchExistingTransactions('user-1', 'card-1', [
      {
        name: 'Hotel Central Cidade - Parcela 2/2',
        value: 320,
        date: '2026-08-02',
      },
    ]);

    expect(creditCardTransactionsRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            {
              date: {
                gte: new Date('2026-08-02T00:00:00.000Z'),
                lt: new Date('2026-09-02T00:00:00.000Z'),
              },
            },
          ],
        }),
      }),
    );
  });
});
