import { Module } from '@nestjs/common';
import { CreditCardsController } from './credit-cards.controller';
import { CreditCardsService } from './services/credit-cards.service';
import { CreditCardTransactionsService } from './services/credit-card-transactions.service';
import { InvoiceService } from './services/invoice.service';
import { VerifyCreditCardOwnershipService } from './services/verify-credit-card-ownership.service';

@Module({
  controllers: [CreditCardsController],
  providers: [
    CreditCardsService,
    CreditCardTransactionsService,
    InvoiceService,
    VerifyCreditCardOwnershipService,
  ],
})
export class CreditCardsModule {}
