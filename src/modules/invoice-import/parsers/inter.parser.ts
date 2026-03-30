import { Injectable } from '@nestjs/common';
import { ParsedTransaction } from '../services/invoice-import.service';
import { BaseBankParser } from './base-bank-parser';

@Injectable()
export class InterParser extends BaseBankParser {
  readonly bankName = 'Inter';

  detect(text: string): boolean {
    const upper = text.toUpperCase();
    return upper.includes('BANCO INTER') || upper.includes('BANCOINTER');
  }

  extract(text: string): ParsedTransaction[] {
    const sectionMatch = text.match(/Despesas da fatura([\s\S]*)/i);
    const section = sectionMatch ? sectionMatch[0] : '';
    if (!section) return [];

    // Matches: "06 de jan. 2026  MERCHANT NAME  -  R$ 1.277,00"
    // Lines with "+ R$" (credits/reversals) don't match this pattern and are skipped automatically
    const lineRe =
      /(\d{2}) de (jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\.\s+(\d{4})\s+(.+?)\s+(?:-\s+)?R\$\s+([\d.]+,\d{2})/gi;

    const skipPatterns = /pagto debito automatico|pagamento|total cartão/i;

    const results: ParsedTransaction[] = [];
    let match: RegExpExecArray | null;

    while ((match = lineRe.exec(section)) !== null) {
      const [, day, monthAbbr, year, rawName, rawValue] = match;
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
