/// <reference types="jest" />

import {
  extractInstallment,
  matchInvoiceToExisting,
  normalizeTitle,
  titleSimilarity,
} from './transaction-matcher';

describe('transaction-matcher', () => {
  test('normalizes abbreviated titles with digits like POSTO 40TAO', () => {
    expect(normalizeTitle('POSTO 40TAO')).toBe('posto quarenta tao');
    expect(normalizeTitle('Posto Quarentão Central')).toBe(
      'posto quarentao central',
    );
  });

  test('treats Posto Quarentão and POSTO 40TAO as similar titles', () => {
    const similarity = titleSimilarity(
      'Posto Quarentão Central',
      'POSTO 40TAO',
    );

    expect(similarity).toBeGreaterThanOrEqual(0.45);
  });

  test('matches same value with fuzzy title', () => {
    const result = matchInvoiceToExisting(
      [{ name: 'POSTO 40TAO', value: 195.5, date: '2026-08-12' }],
      [
        {
          id: 'tx-1',
          name: 'Posto Quarentão Central',
          value: 195.5,
          date: '2026-08-12',
        },
      ],
    );

    expect(result.transactions[0].match?.kind).toBe('same_value');
    expect(result.transactions[0].match?.existing.id).toBe('tx-1');
    expect(result.unmatchedExisting).toHaveLength(0);
  });

  test('flags similar title with different value', () => {
    const result = matchInvoiceToExisting(
      [{ name: 'POSTO 40TAO', value: 210, date: '2026-08-12' }],
      [
        {
          id: 'tx-1',
          name: 'Posto Quarentão Central',
          value: 195.5,
          date: '2026-08-12',
        },
      ],
    );

    expect(result.transactions[0].match?.kind).toBe('value_mismatch');
    expect(result.transactions[0].match?.existing.value).toBe(195.5);
  });

  test('does not match unrelated merchants with the same value when there are duplicates', () => {
    const result = matchInvoiceToExisting(
      [
        { name: 'Netflix', value: 45, date: '2026-08-01' },
        { name: 'Spotify', value: 45, date: '2026-08-02' },
      ],
      [
        { id: 'a', name: 'Padaria Central', value: 45, date: '2026-08-01' },
        { id: 'b', name: 'Farmácia', value: 45, date: '2026-08-02' },
      ],
    );

    expect(result.transactions[0].match).toBeUndefined();
    expect(result.transactions[1].match).toBeUndefined();
    expect(result.unmatchedExisting).toHaveLength(2);
  });

  test('pairs duplicate values using the closest title', () => {
    const result = matchInvoiceToExisting(
      [
        { name: 'DELIVERY *PIZZA NORTE', value: 38.5, date: '2026-08-10' },
        { name: 'DELIVERY *SUSHI SUL', value: 38.5, date: '2026-08-11' },
      ],
      [
        {
          id: 'pizza',
          name: 'Delivery Pizza Norte',
          value: 38.5,
          date: '2026-08-10',
        },
        {
          id: 'sushi',
          name: 'Delivery Sushi Sul',
          value: 38.5,
          date: '2026-08-11',
        },
      ],
    );

    expect(result.transactions[0].match?.existing.id).toBe('pizza');
    expect(result.transactions[1].match?.existing.id).toBe('sushi');
  });

  test('leaves unmatched invoice items as new launches', () => {
    const result = matchInvoiceToExisting(
      [{ name: 'App Transporte', value: 22.4, date: '2026-08-03' }],
      [
        {
          id: 'tx-1',
          name: 'Posto Quarentão Central',
          value: 195.5,
          date: '2026-08-12',
        },
      ],
    );

    expect(result.transactions[0].match).toBeUndefined();
    expect(result.unmatchedExisting).toHaveLength(1);
  });

  test('matches unique same value even with abbreviated titles', () => {
    const result = matchInvoiceToExisting(
      [{ name: 'ATACADO CENTRAL', value: 289, date: '2026-08-20' }],
      [{ id: 'tx-1', name: 'Atacado Central', value: 289, date: '2026-08-19' }],
    );

    expect(result.transactions[0].match?.kind).toBe('same_value');
  });

  test('keeps a hotel package installment separate from an extra daily purchase', () => {
    const result = matchInvoiceToExisting(
      [
        {
          name: 'Hotel Central Cidade - Parcela 2/2',
          value: 320,
          date: '2026-08-02',
        },
      ],
      [
        {
          id: 'tx-1',
          name: 'Hotel Central - diária extra',
          value: 320,
          date: '2026-08-02',
        },
      ],
    );

    expect(result.transactions[0].match).toBeUndefined();
    expect(result.unmatchedExisting).toHaveLength(1);
  });

  test('does not match the same amount from outside the date window', () => {
    const result = matchInvoiceToExisting(
      [{ name: 'Hotel Central Cidade', value: 320, date: '2026-08-02' }],
      [
        {
          id: 'tx-1',
          name: 'Hotel Central - diária extra',
          value: 320,
          date: '2026-07-25',
        },
      ],
    );

    expect(result.transactions[0].match).toBeUndefined();
  });

  test('matches the same installment plan when the user counted from another month', () => {
    const result = matchInvoiceToExisting(
      [
        {
          name: 'Loja Online *Kb - Parcela 10/12',
          value: 145,
          date: '2026-08-02',
        },
        {
          name: 'Streaming Plus - Parcela 4/12',
          value: 19.9,
          date: '2026-08-02',
        },
      ],
      [
        {
          id: 'store',
          name: 'Carrinho Loja Online (9/12)',
          value: 145,
          date: '2026-08-28',
        },
        {
          id: 'streaming',
          name: 'Streaming Plus (8/12)',
          value: 19.9,
          date: '2026-08-30',
        },
      ],
    );

    expect(result.transactions[0].match?.existing.id).toBe('store');
    expect(result.transactions[1].match?.existing.id).toBe('streaming');
  });

  test('does not match the same amount split in a different number of installments', () => {
    const result = matchInvoiceToExisting(
      [
        {
          name: 'Kio*sque Shopping - Parcela 4/4',
          value: 45,
          date: '2026-08-02',
        },
      ],
      [
        {
          id: 'tx-1',
          name: 'Bateria Carro M60AD (8/10)',
          value: 45,
          date: '2026-08-15',
        },
      ],
    );

    expect(result.transactions[0].match).toBeUndefined();
  });

  test.each([
    ['Ec *Cosmeticos - Parcela 5/6', 'Cosméticos presente (5/6)', 92.4],
    [
      'Concessionaria Norte - Parcela 2/3',
      'Concessionaria Norte - revisão 30 mil km (2/3)',
      512,
    ],
    ['Atacado Centro - Parcela 3/6', 'Atacado Central (3/6)', 63],
    ['Farma278 - Parcela 3/3', 'Drogaria Farma (3/3)', 68],
    [
      'Marketplace*Gri - Parcela 6/12',
      'Marketplace presente + interruptor (6/12)',
      61,
    ],
    ['Web.Com* Ic Decor - Parcela 5/5', 'Web.Com shampoo (5/5)', 70],
    ['3t Tintas - Parcela 2/3', '3T Tintas (2/3)', 300],
  ])(
    'matches installment "%s" against "%s" even weeks apart inside the invoice',
    (invoiceName, existingName, value) => {
      const result = matchInvoiceToExisting(
        [{ name: invoiceName, value, date: '2026-08-02' }],
        [{ id: 'tx-1', name: existingName, value, date: '2026-08-28' }],
      );

      expect(result.transactions[0].match?.kind).toBe('same_value');
      expect(result.unmatchedExisting).toHaveLength(0);
    },
  );

  test('matches an installment the user named after the product, not the seller', () => {
    const result = matchInvoiceToExisting(
      [
        {
          name: 'Vendedoraparticular - Parcela 9/10',
          value: 45,
          date: '2026-08-02',
        },
      ],
      [
        {
          id: 'tx-1',
          name: 'Bateria Carro M60AD (9/10)',
          value: 45,
          date: '2026-08-15',
        },
      ],
    );

    expect(result.transactions[0].match?.existing.id).toBe('tx-1');
    expect(result.unmatchedExisting).toHaveLength(0);
  });

  test('requires a similar merchant when the invoice repeats an amount on the same plan', () => {
    const result = matchInvoiceToExisting(
      [
        {
          name: 'Vendedoraparticular - Parcela 9/10',
          value: 45,
          date: '2026-08-02',
        },
        {
          name: 'Presentes Loja - Parcela 9/10',
          value: 45,
          date: '2026-08-02',
        },
      ],
      [
        {
          id: 'tx-1',
          name: 'Bateria Carro M60AD (9/10)',
          value: 45,
          date: '2026-08-15',
        },
        {
          id: 'tx-2',
          name: 'Cadeira gamer (9/10)',
          value: 45,
          date: '2026-08-16',
        },
      ],
    );

    expect(result.transactions[0].match).toBeUndefined();
    expect(result.transactions[1].match).toBeUndefined();
    expect(result.unmatchedExisting).toHaveLength(2);
  });

  test('matches the same merchant and value beyond the date window', () => {
    const result = matchInvoiceToExisting(
      [{ name: 'Seguradora Vida', value: 118, date: '2026-08-19' }],
      [{ id: 'tx-1', name: 'Seguradora Vida', value: 118, date: '2026-08-10' }],
    );

    expect(result.transactions[0].match?.kind).toBe('same_value');
  });

  test('keeps repeated purchases of the same merchant and value as separate items', () => {
    const result = matchInvoiceToExisting(
      [
        { name: 'Drogaria Central', value: 30, date: '2026-08-03' },
        { name: 'Drogaria Central', value: 30, date: '2026-08-28' },
        { name: 'Drogaria Central', value: 30, date: '2026-08-31' },
      ],
      [
        {
          id: 'tx-1',
          name: 'Drogaria Central',
          value: 30,
          date: '2026-08-03',
        },
      ],
    );

    expect(result.transactions[0].match?.existing.id).toBe('tx-1');
    expect(result.transactions[1].match).toBeUndefined();
    expect(result.transactions[2].match).toBeUndefined();
    expect(result.unmatchedExisting).toHaveLength(0);
  });

  test('preserves repeated purchases from the same merchant, cash and installment', () => {
    const result = matchInvoiceToExisting(
      [
        { name: 'EC *COSMETICOS', value: 92.4, date: '2026-08-02' },
        { name: 'EC *COSMETICOS', value: 92.4, date: '2026-08-12' },
        {
          name: 'EC *COSMETICOS - Parcela 5/6',
          value: 92.4,
          date: '2026-08-02',
        },
      ],
      [
        {
          id: 'cash',
          name: 'Cosméticos perfume',
          value: 92.4,
          date: '2026-08-12',
        },
        {
          id: 'installment',
          name: 'Cosméticos presente (5/6)',
          value: 92.4,
          date: '2026-08-22',
        },
      ],
    );

    expect(result.transactions[0].match).toBeUndefined();
    expect(result.transactions[1].match?.existing.id).toBe('cash');
    expect(result.transactions[2].match?.existing.id).toBe('installment');
    expect(result.unmatchedExisting).toHaveLength(0);
  });

  test('flags an installment value mismatch despite the issuer date', () => {
    const result = matchInvoiceToExisting(
      [
        { name: 'Mp *Cosmeticos - Parcela 2/6', value: 34, date: '2026-06-02' },
        { name: 'Mp *Perfumaria - Parcela 2/6', value: 8, date: '2026-06-02' },
      ],
      [
        {
          id: 'existing',
          name: 'MP*Cosmeticos (2/6)',
          value: 32,
          date: '2026-06-20',
        },
      ],
    );

    expect(result.transactions[0].match?.kind).toBe('value_mismatch');
    expect(result.transactions[0].match?.existing.id).toBe('existing');
    expect(result.transactions[1].match).toBeUndefined();
    expect(result.unmatchedExisting).toHaveLength(0);
  });

  test('does not flag unrelated installments with different values', () => {
    const result = matchInvoiceToExisting(
      [
        {
          name: 'Vendedoraparticular - Parcela 9/10',
          value: 60,
          date: '2026-08-02',
        },
      ],
      [
        {
          id: 'existing',
          name: 'Cadeira gamer (9/10)',
          value: 45,
          date: '2026-08-20',
        },
      ],
    );

    expect(result.transactions[0].match).toBeUndefined();
    expect(result.unmatchedExisting).toHaveLength(1);
  });

  test('extracts installment numbers from issuer and user-typed titles', () => {
    expect(extractInstallment('Farma2795 - Parcela 2/3')).toEqual({
      current: 2,
      total: 3,
    });
    expect(extractInstallment('Cooktop Eletro (4/10)')).toEqual({
      current: 4,
      total: 10,
    });
    expect(extractInstallment('SegurosAuto 10/12')).toEqual({
      current: 10,
      total: 12,
    });
    expect(extractInstallment('Posto 40TAO')).toBeNull();
  });
});
