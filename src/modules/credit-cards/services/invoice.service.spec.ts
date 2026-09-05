/// <reference types="jest" />

import { InvoiceService } from './invoice.service';

describe('InvoiceService date windows', () => {
  const service = new InvoiceService(
    {} as never,
    {} as never,
    {} as never,
  );

  test('parses a calendar day as UTC noon', () => {
    const date = service.parseCalendarDate('2026-08-02');

    expect(date.toISOString()).toBe('2026-08-02T12:00:00.000Z');
  });

  test('keeps the closing day in the same invoice regardless of server timezone', () => {
    const imported = service.parseCalendarDate('2026-08-02');

    expect(service.calculateInvoicePeriod(imported, 2)).toEqual({
      month: 9,
      year: 2026,
    });
  });

  test('builds the invoice range in UTC so midnight UTC purchases are included', () => {
    const { invoiceStart, invoiceEnd } = service.calculateInvoiceDateRange(
      9,
      2026,
      2,
    );

    expect(invoiceStart.toISOString()).toBe('2026-08-02T00:00:00.000Z');
    expect(invoiceEnd.toISOString()).toBe('2026-09-02T00:00:00.000Z');
    expect(invoiceStart.getTime()).toBeLessThanOrEqual(
      new Date('2026-08-02T00:00:00.000Z').getTime(),
    );
    expect(new Date('2026-08-02T12:00:00.000Z').getTime()).toBeLessThan(
      invoiceEnd.getTime(),
    );
  });

  test('sends a purchase on the next closing day to the following invoice', () => {
    const onClosingDay = service.parseCalendarDate('2026-09-02');

    expect(service.calculateInvoicePeriod(onClosingDay, 2)).toEqual({
      month: 10,
      year: 2026,
    });
  });
});

describe('InvoiceService open charges', () => {
  const creditCardTransactionsRepo = { findMany: jest.fn() };
  const service = new InvoiceService(
    {} as never,
    {} as never,
    creditCardTransactionsRepo as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('counts future installments toward the used limit', async () => {
    creditCardTransactionsRepo.findMany.mockResolvedValue([
      { value: 200, date: new Date('2026-08-10T12:00:00.000Z') },
      { value: 80, date: new Date('2026-09-10T12:00:00.000Z') },
      { value: 80, date: new Date('2026-10-10T12:00:00.000Z') },
    ]);

    await expect(
      service.getOpenChargeTotals('user-1', 'card-1', 2),
    ).resolves.toEqual({
      currentInvoiceTotal: 200,
      futureTotal: 160,
      usedLimit: 360,
    });

    expect(creditCardTransactionsRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: { gte: new Date('2026-08-02T00:00:00.000Z') },
        }),
      }),
    );
  });

  test('does not treat past invoices as open charges', async () => {
    creditCardTransactionsRepo.findMany.mockResolvedValue([
      { value: 50, date: new Date('2026-08-15T12:00:00.000Z') },
    ]);

    await service.getOpenChargeTotals('user-1', 'card-1', 2);

    expect(creditCardTransactionsRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: { gte: new Date('2026-08-02T00:00:00.000Z') },
        }),
      }),
    );
  });
});
