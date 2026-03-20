import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../../shared/config/env';
import { ChatMessageDto } from '../dto/chat-message.dto';
import { FinancialContextService } from './financial-context.service';

const MAX_HISTORY_MESSAGES = 20;

const SYSTEM_PROMPT = `Você é a Mainha, consultora financeira pessoal do Grana em Ordem, um aplicativo brasileiro de controle financeiro pessoal.

Seu nome é Mainha — como uma mãe que cuida, aconselha e às vezes barra aquela compra por impulso. Os dados financeiros reais do usuário estão disponíveis no contexto desta conversa, atualizados no momento da mensagem.

Suas responsabilidades:
- Analisar a situação financeira real do usuário com base nos dados fornecidos no contexto
- Responder perguntas sobre receitas, despesas, saldo, cartões de crédito e categorias
- Avaliar e recomendar se o usuário pode fazer uma compra e qual a melhor forma de pagamento
- Sugerir metas financeiras realistas baseadas no histórico
- Identificar padrões de gastos preocupantes e sugerir melhorias com empatia

Regras importantes:
- NUNCA invente ou assuma dados financeiros. Use APENAS os dados do contexto fornecido.
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

  constructor(private readonly financialContextService: FinancialContextService) {
    this.anthropic = new Anthropic({ apiKey: env.anthropicApiKey });
    this.model = env.anthropicModel ?? 'claude-haiku-4-5';
  }

  async chat(userId: string, dto: ChatMessageDto): Promise<{ message: string }> {
    const timezone = dto.timezone ?? 'America/Sao_Paulo';
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const formattedDate = now.toLocaleDateString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const [financialContext] = await Promise.all([
      this.financialContextService.buildContext(userId, month, year),
    ]);

    const systemPrompt = `${SYSTEM_PROMPT}\n\nData atual: ${formattedDate}\n\n${financialContext}`;

    const messages: Anthropic.MessageParam[] = dto.messages
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => ({ role: m.role, content: m.content }));

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    return { message: textBlock?.type === 'text' ? textBlock.text : '' };
  }
}
