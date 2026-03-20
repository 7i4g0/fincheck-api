import { Module } from '@nestjs/common';
import { AiAdvisorController } from './ai-advisor.controller';
import { AiAdvisorService } from './services/ai-advisor.service';
import { FinancialContextService } from './services/financial-context.service';

@Module({
  controllers: [AiAdvisorController],
  providers: [AiAdvisorService, FinancialContextService],
})
export class AiAdvisorModule {}
