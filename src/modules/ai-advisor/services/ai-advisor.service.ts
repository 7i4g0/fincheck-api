import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import Anthropic, { APIError } from '@anthropic-ai/sdk';
import { FeatureType } from '@prisma/client';
import { env } from '../../../shared/config/env';
import { UsageTrackingService } from '../../usage-tracking/usage-tracking.service';
import { ChatMessageDto } from '../dto/chat-message.dto';
import { FinancialContextService } from './financial-context.service';

const MAX_HISTORY_MESSAGES = 20;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 1;

const UNAVAILABLE_MESSAGE =
  'A Mainha está indisponível neste momento. Tente novamente em alguns minutos.';

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
- Considere sempre a visão consolidada dos últimos 12 meses e todos os lançamentos, tanto de contas quanto de cartões.
- Pagamentos de fatura são quitações das compras já informadas e não devem ser somados novamente como despesa.
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
  private readonly logger = new Logger(AiAdvisorService.name);
  private readonly anthropic: Anthropic;
  private readonly model: string;

  constructor(
    private readonly financialContextService: FinancialContextService,
    private readonly usageTracking: UsageTrackingService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: env.anthropicApiKey,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    });
    this.model = env.anthropicModel ?? 'claude-haiku-4-5';
  }

  async chat(
    userId: string,
    dto: ChatMessageDto,
  ): Promise<{ message: string }> {
    const timezone = dto.timezone ?? 'America/Sao_Paulo';
    const now = new Date(
      new Date().toLocaleString('en-US', { timeZone: timezone }),
    );
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

    let response: Anthropic.Message;

    try {
      response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      });
    } catch (error) {
      throw this.buildChatException(error);
    }

    this.usageTracking
      .track({
        userId,
        feature: FeatureType.CHAT,
        model: this.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        metadata: { messageCount: messages.length },
      })
      .catch((error) => {
        this.logger.error(
          `Falha ao registrar consumo do chat: ${this.describeError(error)}`,
        );
      });

    const textBlock = response.content.find((b) => b.type === 'text');
    const message = textBlock?.type === 'text' ? textBlock.text.trim() : '';

    if (!message) {
      this.logger.warn(
        `Resposta sem conteúdo de texto (stop_reason: ${response.stop_reason})`,
      );
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE, {
        cause: new Error(
          `Resposta sem texto (stop_reason: ${response.stop_reason})`,
        ),
      });
    }

    return { message };
  }

  /**
   * Converts Anthropic failures into HTTP responses the chat UI can display,
   * without leaking provider details (billing state, request IDs) to the user.
   */
  private buildChatException(error: unknown): HttpException {
    this.logger.error(
      `Falha na chamada à Anthropic: ${this.describeError(error)}`,
    );

    if (!(error instanceof APIError)) {
      return new ServiceUnavailableException(UNAVAILABLE_MESSAGE, {
        cause: error,
      });
    }

    if (error.status === 429) {
      return new HttpException(
        'A Mainha atingiu o limite de mensagens agora. Aguarde um instante e tente de novo.',
        HttpStatus.TOO_MANY_REQUESTS,
        { cause: error },
      );
    }

    if (error.status === undefined) {
      return new HttpException(
        'A Mainha demorou demais para responder. Tente novamente.',
        HttpStatus.GATEWAY_TIMEOUT,
        { cause: error },
      );
    }

    return new ServiceUnavailableException(UNAVAILABLE_MESSAGE, {
      cause: error,
    });
  }

  private describeError(error: unknown): string {
    if (error instanceof APIError) {
      return `status=${error.status} requestId=${error.requestID} message=${error.message}`;
    }

    return error instanceof Error ? error.message : String(error);
  }
}
