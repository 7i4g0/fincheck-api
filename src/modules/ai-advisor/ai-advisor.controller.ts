import { Body, Controller, Post } from '@nestjs/common';
import { ActiveUserId } from '../../shared/decorators/ActiveUserId';
import { ChatMessageDto } from './dto/chat-message.dto';
import { AiAdvisorService } from './services/ai-advisor.service';

@Controller('ai-advisor')
export class AiAdvisorController {
  constructor(private readonly aiAdvisorService: AiAdvisorService) {}

  @Post('chat')
  chat(
    @ActiveUserId() userId: string,
    @Body() dto: ChatMessageDto,
  ) {
    return this.aiAdvisorService.chat(userId, dto);
  }
}
