import { ParsedTransaction } from '../services/invoice-import.service';
import { BankParser } from './bank-parser.interface';

export abstract class BaseBankParser implements BankParser {
  abstract readonly bankName: string;
  abstract detect(text: string): boolean;
  abstract extract(text: string): ParsedTransaction[];

  protected readonly MONTH_MAP: Record<string, string> = {
    jan: '01', fev: '02', mar: '03', abr: '04',
    mai: '05', jun: '06', jul: '07', ago: '08',
    set: '09', out: '10', nov: '11', dez: '12',
  };

  protected monthToNumber(abbr: string): string | undefined {
    return this.MONTH_MAP[abbr.toLowerCase()];
  }

  protected parseValue(raw: string): number {
    return parseFloat(raw.replace(/\./g, '').replace(',', '.'));
  }
}
