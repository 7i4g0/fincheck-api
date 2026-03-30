import { ParsedTransaction } from '../services/invoice-import.service';

export interface BankParser {
  readonly bankName: string;
  detect(text: string): boolean;
  extract(text: string): ParsedTransaction[];
}
