import { Module } from '@nestjs/common';
import { CreditCardsModule } from '../credit-cards/credit-cards.module';
import { InvoiceImportController } from './invoice-import.controller';
import { InvoiceImportService } from './services/invoice-import.service';
import { BANK_PARSERS, BankParserRegistry } from './services/bank-parser.registry';
import { NubankParser } from './parsers/nubank.parser';
import { InterParser } from './parsers/inter.parser';

const PARSERS = [NubankParser, InterParser];

@Module({
  imports: [CreditCardsModule],
  controllers: [InvoiceImportController],
  providers: [
    InvoiceImportService,
    BankParserRegistry,
    ...PARSERS,
    {
      provide: BANK_PARSERS,
      useFactory: (...parsers) => parsers,
      inject: PARSERS,
    },
  ],
})
export class InvoiceImportModule {}
