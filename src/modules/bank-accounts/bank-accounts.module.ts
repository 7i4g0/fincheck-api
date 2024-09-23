import { Module } from '@nestjs/common';
import { BankAccountsController } from './bank-accounts.controller';
import { BankAccountsService } from './services/bank-accounts.service';
import { VerifyBankAccountOwnershipService } from './services/verify-bank-account-ownership.service';

@Module({
  controllers: [BankAccountsController],
  providers: [BankAccountsService, VerifyBankAccountOwnershipService],
  exports: [VerifyBankAccountOwnershipService],
})
export class BankAccountsModule {}
