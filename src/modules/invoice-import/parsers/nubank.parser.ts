import { Injectable } from '@nestjs/common';
import { ParsedTransaction } from '../services/invoice-import.service';
import { BaseBankParser } from './base-bank-parser';

@Injectable()
export class NubankParser extends BaseBankParser {
  readonly bankName = 'Nubank';

  detect(text: string): boolean {
    return text.slice(0, 2000).toUpperCase().includes('NUBANK');
  }

  extract(text: string): ParsedTransaction[] {
    const yearMatch = text.match(/FATURA\s+\d{2}\s+[A-Z]{3}\s+(\d{4})/);
    const year = yearMatch ? yearMatch[1] : String(new Date().getFullYear());

    const sectionMatch = text.match(
      /TRANSAÇÕES[\s\S]+?(?=Pagamentos e Financiamentos|$)/i,
    );
    const section = sectionMatch ? sectionMatch[0] : '';
    if (!section) return [];

    const lineRe =
      /(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(?:[•·•]+\s+\d{4}\s+)?(.+?)\s+R\$\s+([\d.]+,\d{2})/g;

    const skipPatterns =
      /pagamento|ajuste|saldo restante|fatura atual|total de compras/i;

    const results: ParsedTransaction[] = [];
    let match: RegExpExecArray | null;

    while ((match = lineRe.exec(section)) !== null) {
      const [, day, monthAbbr, rawName, rawValue] = match;
      const month = this.monthToNumber(monthAbbr);
      if (!month) continue;

      const name = rawName.trim();
      if (skipPatterns.test(name)) continue;

      const value = this.parseValue(rawValue);
      if (value <= 0 || name.length === 0) continue;

      results.push({ name, value, date: `${year}-${month}-${day.padStart(2, '0')}` });
    }

    return results;
  }
}
