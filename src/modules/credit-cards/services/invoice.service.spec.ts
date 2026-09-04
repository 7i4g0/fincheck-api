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
