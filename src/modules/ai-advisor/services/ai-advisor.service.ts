import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../../shared/config/env';
import { ChatMessageDto } from '../dto/chat-message.dto';
import { AiToolsService } from './ai-tools.service';

const MAX_HISTORY_MESSAGES = 20;

const SYSTEM_PROMPT = `Você é a Mainha, consultora financeira pessoal do Grana em Ordem, um aplicativo brasileiro de controle financeiro pessoal.

Seu nome é Mainha — como uma mãe que cuida, aconselha e às vezes barra aquela compra por impulso. Você tem acesso em tempo real às finanças do usuário através de ferramentas disponíveis.

Suas responsabilidades:
- Analisar a situação financeira real do usuário com base nos dados das contas
- Responder perguntas sobre receitas, despesas, saldo, cartões de crédito e categorias
- Avaliar e recomendar se o usuário pode fazer uma compra e qual a melhor forma de pagamento
- Sugerir metas financeiras realistas baseadas no histórico
- Identificar padrões de gastos preocupantes e sugerir melhorias com empatia

Regras importantes:
- NUNCA invente ou assuma dados. Use SEMPRE as ferramentas para acessar informações reais antes de responder.
- Use valores reais em Reais (R$) com formatação brasileira.
- Seja direta, prática e use linguagem acessível — não acadêmica.
- Mantenha um tom caloroso, cuidadoso e encorajador, como uma mãe que quer o melhor para o filho.
- Quando o usuário quiser fazer uma compra impulsiva ou irresponsável, você pode ser firme com carinho — como uma mãe faria.
- Se o usuário perguntar algo fora de finanças pessoais, redirecione gentilmente ao tema.
- Nunca exiba IDs internos (UUIDs) para o usuário.
- Responda sempre em português brasileiro.
- NUNCA use formatação markdown (sem **, __, ##, listas com - ou *). Escreva em texto corrido, como numa conversa.`;

@Injectable()
export class AiAdvisorService {
  private readonly anthropic: Anthropic;
  private readonly model: string;

  constructor(private readonly aiToolsService: AiToolsService) {
    this.anthropic = new Anthropic({ apiKey: env.anthropicApiKey });
    this.model = env.anthropicModel ?? 'claude-haiku-4-5';
  }

  async chat(userId: string, dto: ChatMessageDto): Promise<{ message: string }> {
    const now = new Date();
    const timezone = dto.timezone ?? 'America/Sao_Paulo';
    const formattedDate = now.toLocaleDateString('pt-BR', {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const systemPrompt = `${SYSTEM_PROMPT}\n\nData e hora atual: ${formattedDate}`;

    // Truncate history to control token costs — keep the last N messages
    let messages: Anthropic.MessageParam[] = dto.messages
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => ({ role: m.role, content: m.content }));

    // Agentic loop: Claude may call tools multiple times before the final answer
    while (true) {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 1024,
        // cache_control marks static content so Anthropic reuses it across requests
        // (~30% cost reduction on input tokens for returning users)
        system: [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools: this.aiToolsService.getToolDefinitions(),
        messages,
      });

      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find((b) => b.type === 'text');
        return { message: textBlock?.type === 'text' ? textBlock.text : '' };
      }

      if (response.stop_reason === 'tool_use') {
        // Append assistant's response (contains tool_use blocks)
        messages = [
          ...messages,
          { role: 'assistant', content: response.content },
        ];

        // Execute all tool calls in parallel, always scoped to userId
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
        );

        const toolResults = await Promise.all(
          toolUseBlocks.map((block) =>
            this.aiToolsService.executeTool(userId, block),
          ),
        );

        // Append tool results so Claude can continue reasoning
        messages = [
          ...messages,
          { role: 'user', content: toolResults },
        ];

        // Continue loop — Claude will process results and either call more tools or end
        continue;
      }

      // Unexpected stop reason — return whatever text we have
      const textBlock = response.content.find((b) => b.type === 'text');
      return { message: textBlock?.type === 'text' ? textBlock.text : '' };
    }
  }
}
