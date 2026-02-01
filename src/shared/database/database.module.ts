import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { BankAccountsRepository } from './repositories/bank-accounts.repositories';
import { CategoriesRepository } from './repositories/categories.repositories';
import { CreditCardTransactionsRepository } from './repositories/credit-card-transactions.repositories';
import { CreditCardsRepository } from './repositories/credit-cards.repositories';
import { PasswordResetTokensRepository } from './repositories/password-reset-tokens.repositories';
import { TransactionsRepository } from './repositories/transactions.repositories';
import { UsersRepository } from './repositories/users.repositories';

@Global()
@Module({
  providers: [
    PrismaService,
    UsersRepository,
    CategoriesRepository,
    BankAccountsRepository,
    TransactionsRepository,
    CreditCardsRepository,
    CreditCardTransactionsRepository,
    PasswordResetTokensRepository,
  ],
  exports: [
    PrismaService,
    UsersRepository,
    CategoriesRepository,
    BankAccountsRepository,
    TransactionsRepository,
    CreditCardsRepository,
    CreditCardTransactionsRepository,
    PasswordResetTokensRepository,
  ],
})
export class DatabaseModule {}
