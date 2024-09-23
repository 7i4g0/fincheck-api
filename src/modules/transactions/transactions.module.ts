import { Module } from '@nestjs/common';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { CategoriesModule } from '../categories/categories.module';
import { TransactionsService } from './services/transactions.service';
import { VerifyTransactionOwnershipService } from './services/verify-transaction-ownership.service';
import { TransactionsController } from './transactions.controller';

@Module({
  imports: [BankAccountsModule, CategoriesModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, VerifyTransactionOwnershipService],
})
export class TransactionsModule {}
