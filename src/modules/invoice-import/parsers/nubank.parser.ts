import { Injectable } from '@nestjs/common';
import { ParsedTransaction } from '../services/invoice-import.service';
import { BaseBankParser } from './base-bank-parser';

@Injectable()
export class NubankParser extends BaseBankParser {
  readonly bankName = 'Nubank';

  detect(text: string): boolean {
    const upper = text.toUpperCase();
    return (
      upper.includes('NUBANK') ||
      upper.includes('NU PAGAMENTOS') ||
      upper.includes('18.236.120/0001-58')
    );
  }

  extract(text: string): ParsedTransaction[] {
    const header = text.match(/FATURA\s+\d{2}\s+([A-Z]{3})\s+(\d{4})/);
    const invoiceYear = header
      ? parseInt(header[2], 10)
      : new Date().getFullYear();
    const invoiceMonth = header ? this.monthToNumber(header[1]) : undefined;

    const section = this.extractTransactionsSection(text);
    if (!section) return [];

    // Names are capped and newline-free so a match can never span a page break
    const lineRe =
      /(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(?:[•·]+\s+\d{4}\s+)?([^\n]{1,60}?)\s+R\$\s+([\d.]+,\d{2})/g;

    const skipPatterns =
      /pagamento|ajuste|saldo restante|fatura atual|total de compras|^iof de/i;

    const results: ParsedTransaction[] = [];
    let match: RegExpExecArray | null;

    while ((match = lineRe.exec(section)) !== null) {
      const [, day, monthAbbr, rawName, rawValue] = match;
      const month = this.monthToNumber(monthAbbr);
      if (!month) continue;

      const name = rawName.trim();
      if (!name || skipPatterns.test(name)) continue;
      if (/FATURA|TRANSAÇÕES|EMISSÃO/i.test(name)) continue;

      const value = this.parseValue(rawValue);
      if (value <= 0) continue;

      // A December purchase belongs to the previous year on a January invoice
      const crossesYear =
        invoiceMonth !== undefined &&
        parseInt(month, 10) > parseInt(invoiceMonth, 10);

      const year = crossesYear ? invoiceYear - 1 : invoiceYear;

      results.push({
        name,
        value,
        date: `${year}-${month}-${day.padStart(2, '0')}`,
      });
    }

    const refundRe =
      /(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+Estorno de ["“]([^"”]+)["”][^\n]{0,220}?−R\$\s+([\d.]+,\d{2})/gi;

    while ((match = refundRe.exec(section)) !== null) {
      const [, day, monthAbbr, merchant, rawValue] = match;
      const month = this.monthToNumber(monthAbbr);
      if (!month) continue;

      const crossesYear =
        invoiceMonth !== undefined &&
        parseInt(month, 10) > parseInt(invoiceMonth, 10);
      const year = crossesYear ? invoiceYear - 1 : invoiceYear;

      results.push({
        name: `Estorno: ${merchant.trim()}`,
        value: -this.parseValue(rawValue),
        date: `${year}-${month}-${day.padStart(2, '0')}`,
      });
    }

    return results.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Anchors on the dated "TRANSAÇÕES DE 02 AGO A 02 SET" heading — a bare
   * "TRANSAÇÕES" also appears in the limits page ("VALOR MÁXIMO PARA TRANSAÇÕES").
   * Repeated page headers/footers and currency conversion lines are dropped so
   * they can't be absorbed into a transaction name or mistaken for its value.
   */
  private extractTransactionsSection(text: string): string {
    const sectionMatch = text.match(
      /TRANSAÇÕES\s+DE\s+\d{2}\s+[A-Z]{3}\s+A\s+\d{2}\s+[A-Z]{3}[\s\S]+?(?=Pagamentos e Financiamentos|$)/i,
    );
    if (!sectionMatch) return '';

    return sectionMatch[0]
      .replace(
        /FATURA\s+\d{2}\s+[A-Z]{3}\s+\d{4}\s+EMISSÃO E ENVIO\s+\d{2}\s+[A-Z]{3}\s+\d{4}/g,
        '\n',
      )
      .replace(/TRANSAÇÕES\s+DE\s+\d{2}\s+[A-Z]{3}\s+A\s+\d{2}\s+[A-Z]{3}/gi, '\n')
      .replace(/\b\d{1,2}\s+de\s+\d{1,2}\b/g, '\n')
      .replace(
        /Conversão:\s*BRL\s*[\d.,]+\s*=\s*USD\s*[\d.,]+\s*=\s*R\$\s*[\d.,]+/gi,
        '',
      )
      .replace(/BRL\s*[\d.,]+\s*=\s*USD\s*[\d.,]+/gi, '');
  }
}
