import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { FinancialContextService } from './financial-context.service';

@Injectable()
export class AiToolsService {
  constructor(private readonly financialContext: FinancialContextService) {}

  getToolDefinitions(): Anthropic.Tool[] {
    return [
      {
        name: 'get_financial_overview',
        description:
          'Retorna todas as contas bancárias do usuário com seus saldos atuais e o patrimônio líquido total.',
        input_schema: {
          type: 'object' as const,
          properties: {},
          required: [],
        },
      },
      {
        name: 'get_transactions',
        description:
          'Retorna as transações de contas bancárias do usuário (receitas, despesas e transferências) em um mês e ano específicos. NÃO inclui compras de cartão de crédito — para isso use get_credit_card_transactions.',
        input_schema: {
          type: 'object' as const,
          properties: {
            month: {
              type: 'number',
              description: 'Mês (1-12)',
            },
            year: {
              type: 'number',
              description: 'Ano (ex: 2025)',
            },
            type: {
              type: 'string',
              enum: ['INCOME', 'EXPENSE', 'TRANSFER'],
              description: 'Filtro opcional por tipo de transação',
            },
          },
          required: ['month', 'year'],
        },
      },
      {
        name: 'get_credit_card_transactions',
        description:
          'Retorna as compras feitas no cartão de crédito do usuário em um mês e ano específicos. Use esta ferramenta quando o usuário perguntar sobre gastos no cartão de crédito. Pode filtrar por cartão específico.',
        input_schema: {
          type: 'object' as const,
          properties: {
            month: {
              type: 'number',
              description: 'Mês (1-12)',
            },
            year: {
              type: 'number',
              description: 'Ano (ex: 2025)',
            },
            creditCardId: {
              type: 'string',
              description: 'ID do cartão de crédito (opcional, para filtrar por cartão específico)',
            },
          },
          required: ['month', 'year'],
        },
      },
      {
        name: 'get_credit_cards',
        description:
          'Retorna todos os cartões de crédito do usuário com limite, dias de fechamento e vencimento.',
        input_schema: {
          type: 'object' as const,
          properties: {},
          required: [],
        },
      },
      {
        name: 'get_categories',
        description:
          'Retorna todas as categorias do usuário com tipo (receita/despesa) e valor estimado de orçamento.',
        input_schema: {
          type: 'object' as const,
          properties: {},
          required: [],
        },
      },
      {
        name: 'get_monthly_trend',
        description:
          'Retorna o histórico de receitas e despesas totais dos últimos N meses.',
        input_schema: {
          type: 'object' as const,
          properties: {
            months: {
              type: 'number',
              description: 'Número de meses para analisar (padrão: 3, máximo: 12)',
            },
          },
          required: [],
        },
      },
      {
        name: 'get_category_breakdown',
        description:
          'Retorna o total gasto por categoria em um mês/ano específico, ordenado do maior para o menor gasto.',
        input_schema: {
          type: 'object' as const,
          properties: {
            month: {
              type: 'number',
              description: 'Mês (1-12)',
            },
            year: {
              type: 'number',
              description: 'Ano (ex: 2025)',
            },
          },
          required: ['month', 'year'],
        },
      },
    ];
  }

  async executeTool(
    userId: string,
    toolUseBlock: Anthropic.ToolUseBlock,
  ): Promise<Anthropic.ToolResultBlockParam> {
    const input = toolUseBlock.input as Record<string, unknown>;

    try {
      let result: unknown;

      switch (toolUseBlock.name) {
        case 'get_financial_overview':
          result = await this.financialContext.getBankAccounts(userId);
          break;

        case 'get_transactions':
          result = await this.financialContext.getTransactions(
            userId,
            input.month as number,
            input.year as number,
            input.type as 'INCOME' | 'EXPENSE' | 'TRANSFER' | undefined,
          );
          break;

        case 'get_credit_card_transactions':
          result = await this.financialContext.getCreditCardTransactions(
            userId,
            input.month as number,
            input.year as number,
            input.creditCardId as string | undefined,
          );
          break;

        case 'get_credit_cards':
          result = await this.financialContext.getCreditCards(userId);
          break;

        case 'get_categories':
          result = await this.financialContext.getCategories(userId);
          break;

        case 'get_monthly_trend': {
          const months = Math.min((input.months as number) ?? 3, 12);
          result = await this.financialContext.getMonthlyTrend(userId, months);
          break;
        }

        case 'get_category_breakdown':
          result = await this.financialContext.getCategoryBreakdown(
            userId,
            input.month as number,
            input.year as number,
          );
          break;

        default:
          result = { error: 'Ferramenta desconhecida' };
      }

      return {
        type: 'tool_result',
        tool_use_id: toolUseBlock.id,
        content: JSON.stringify(result),
      };
    } catch {
      return {
        type: 'tool_result',
        tool_use_id: toolUseBlock.id,
        content: JSON.stringify({ error: 'Erro ao buscar dados financeiros' }),
        is_error: true,
      };
    }
  }
}
