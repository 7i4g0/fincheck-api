import { Inject, Injectable } from '@nestjs/common';
import { BankParser } from '../parsers/bank-parser.interface';

export const BANK_PARSERS = 'BANK_PARSERS';

@Injectable()
export class BankParserRegistry {
  constructor(@Inject(BANK_PARSERS) private readonly parsers: BankParser[]) {}

  findParser(text: string): BankParser | null {
    return this.parsers.find((p) => p.detect(text)) ?? null;
  }
}
