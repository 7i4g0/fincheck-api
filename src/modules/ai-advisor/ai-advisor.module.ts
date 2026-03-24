import { Module } from '@nestjs/common';
import { CreditCardsModule } from '../credit-cards/credit-cards.module';
import { AiAdvisorController } from './ai-advisor.controller';
import { AiAdvisorService } from './services/ai-advisor.service';
import { FinancialContextService } from './services/financial-context.service';

@Module({
  imports: [CreditCardsModule],
  controllers: [AiAdvisorController],
  providers: [AiAdvisorService, FinancialContextService],
})
export class AiAdvisorModule {}
