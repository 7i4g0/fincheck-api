/// <reference types="jest" />

import { NubankParser } from './nubank.parser';

describe('NubankParser', () => {
  const parser = new NubankParser();

  test('extracts purchases and refunds with opposite values', () => {
    const text = [
      'NUBANK',
      'FATURA 10 AGO 2026 EMISSÃO E ENVIO 02 AGO 2026',
      'TRANSAÇÕES DE 02 JUL A 02 AGO',
      '02 JUL •••• 0000 Assinatura Exemplo R$ 25,00',
      '04 JUL Estorno de "Assinatura Exemplo" Estorno referente a compra em ' +
        'Assinatura Exemplo, de valor R$ 25,00, realizada em 02 de Julho de 2026 −R$ 25,00',
      'Pagamentos e Financiamentos',
    ].join('\n');

    expect(parser.extract(text)).toEqual([
      {
        name: 'Assinatura Exemplo',
        value: 25,
        date: '2026-07-02',
      },
      {
        name: 'Estorno: Assinatura Exemplo',
        value: -25,
        date: '2026-07-04',
      },
    ]);
  });

  test('keeps multiple refunds as separate adjustments', () => {
    const text = [
      'NU PAGAMENTOS',
      'FATURA 10 JUL 2026 EMISSÃO E ENVIO 02 JUL 2026',
      'TRANSAÇÕES DE 02 JUN A 02 JUL',
      '25 JUN Estorno de "Assinatura Exemplo" Estorno referente a compra em ' +
        'Assinatura Exemplo, de valor R$ 2,00, realizada em 02 de Junho de 2026 −R$ 2,00',
      '01 JUL Estorno de "Assinatura Exemplo" Estorno referente a compra em ' +
        'Assinatura Exemplo, de valor R$ 25,00, realizada em 23 de Junho de 2026 −R$ 25,00',
      '01 JUL Estorno de "Assinatura Exemplo" Estorno referente a compra em ' +
        'Assinatura Exemplo, de valor R$ 25,00, realizada em 29 de Junho de 2026 −R$ 25,00',
      'Pagamentos e Financiamentos',
    ].join('\n');

    const transactions = parser.extract(text);

    expect(transactions).toHaveLength(3);
    expect(transactions.reduce((sum, item) => sum + item.value, 0)).toBeCloseTo(
      -52,
    );
  });
});
