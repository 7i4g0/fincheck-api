import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { SentryModule } from '@sentry/nestjs/setup';
import { AiAdvisorModule } from './modules/ai-advisor/ai-advisor.module';
import { AuthGuard } from './modules/auth/auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { BankAccountsModule } from './modules/bank-accounts/bank-accounts.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { CreditCardsModule } from './modules/credit-cards/credit-cards.module';
import { InvoiceImportModule } from './modules/invoice-import/invoice-import.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { UsageTrackingModule } from './modules/usage-tracking/usage-tracking.module';
import { UsersModule } from './modules/users/users.module';
import { DatabaseModule } from './shared/database/database.module';
import { AllExceptionsFilter } from './shared/errors/all-exceptions.filter';
import { ErrorAlertModule } from './shared/errors/error-alert.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    UsersModule,
    DatabaseModule,
    AuthModule,
    CategoriesModule,
    BankAccountsModule,
    TransactionsModule,
    CreditCardsModule,
    InvoiceImportModule,
    AiAdvisorModule,
    UsageTrackingModule,
    ErrorAlertModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
