import { CategoriesRepository } from '../../../shared/database/repositories/categories.repositories';
import { CreditCardTransactionsRepository } from '../../../shared/database/repositories/credit-card-transactions.repositories';
import { CreditCardsRepository } from '../../../shared/database/repositories/credit-cards.repositories';
import { Injectable, NotFoundException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { FeatureType } from '@prisma/client';
import { env } from '../../../shared/config/env';
import { UsageTrackingService } from '../../usage-tracking/usage-tracking.service';
import { InvoiceService } from '../../credit-cards/services/invoice.service';
import { ConfirmInvoiceImportDto } from '../dto/confirm-invoice-import.dto';
import { BankParserRegistry } from './bank-parser.registry';

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ParsedTransaction {
  name: string;
  value: number;
  date: string;
  suggestedCategoryId?: string;
}

@Injectable()
export class InvoiceImportService {
  private readonly anthropic: Anthropic;

  constructor(
    private readonly categoriesRepo: CategoriesRepository,
    private readonly creditCardsRepo: CreditCardsRepository,
    private readonly creditCardTransactionsRepo: CreditCardTransactionsRepository,
    private readonly invoiceService: InvoiceService,
    private readonly parserRegistry: BankParserRegistry,
    private readonly usageTracking: UsageTrackingService,
  ) {
    this.anthropic = new Anthropic({ apiKey: env.anthropicApiKey });
  }

  // ─── PDF parsing ─────────────────────────────────────────────────────────────

  async parseInvoiceText(
    userId: string,
    creditCardId: string,
    invoiceText: string,
  ): Promise<{ transactions: ParsedTransaction[] }> {
    const card = await this.creditCardsRepo.findFirst({
      where: { id: creditCardId, userId },
    });
    if (!card) throw new NotFoundException('Cartão não encontrado.');

    // Step 1: extract transactions (registry parsers, AI fallback for unknown banks)
    const parser = this.parserRegistry.findParser(invoiceText);

    let transactions: ParsedTransaction[];
    let extractionUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    let usedAiExtraction = false;

    if (parser) {
      transactions = parser.extract(invoiceText);
      console.log(
        `[invoice-import] parser=${parser.bankName} transactions=${transactions.length}`,
      );
    } else {
      console.log('[invoice-import] parser=ai-fallback — no regex parser matched');
      const result = await this.extractWithAI(invoiceText);
      transactions = result.transactions;
      extractionUsage = result.usage;
      usedAiExtraction = true;
      console.log(
        `[invoice-import] parser=ai-fallback transactions=${transactions.length}`,
      );
    }

    // Step 2: suggest categories with Haiku
    const { transactions: categorized, usage: categoryUsage } =
      await this.applyCategorySuggestions(userId, transactions);

    const model = env.anthropicModel ?? 'claude-haiku-4-5';
    void this.usageTracking.track({
      userId,
      feature: FeatureType.INVOICE_IMPORT,
      model,
      inputTokens: extractionUsage.inputTokens + categoryUsage.inputTokens,
      outputTokens: extractionUsage.outputTokens + categoryUsage.outputTokens,
      metadata: {
        transactionsCount: categorized.length,
        usedAiExtraction,
        parser: parser?.bankName ?? null,
      },
    });

    return { transactions: categorized };
  }

  // ─── Category suggestion (used by both PDF and CSV flows) ────────────────────

  async suggestCategories(
    userId: string,
    names: string[],
  ): Promise<Record<string, string>> {
    if (names.length === 0) return {};

    const categories = await this.categoriesRepo.findMany({
      where: { userId, type: 'EXPENSE' },
      select: { id: true, name: true },
    });

    if (categories.length === 0) return {};

    const { mapping, usage } = await this.callCategoryAI(
      names,
      categories as { id: string; name: string }[],
    );

    const model = env.anthropicModel ?? 'claude-haiku-4-5';
    void this.usageTracking.track({
      userId,
      feature: FeatureType.INVOICE_IMPORT,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      metadata: { namesCount: names.length },
    });

    return mapping;
  }

  // ─── Confirm import ───────────────────────────────────────────────────────────

  async confirmImport(
    userId: string,
    dto: ConfirmInvoiceImportDto,
  ): Promise<{ message: string; count: number }> {
    const card = await this.creditCardsRepo.findFirst({
      where: { id: dto.creditCardId, userId },
    });
    if (!card) throw new NotFoundException('Cartão não encontrado.');

    const data = dto.transactions.map((t) => ({
      userId,
      creditCardId: dto.creditCardId,
      categoryId: t.categoryId ?? null,
      name: t.name,
      value: t.value,
      date: new Date(t.date),
      installments: 1,
      currentInstallment: 1,
    }));

    await this.creditCardTransactionsRepo.createMany({ data });

    await this.invoiceService.updateInvoicesForTransactionDates(
      userId,
      dto.creditCardId,
      card.closingDay,
      data.map((d) => d.date),
    );

    return {
      message: `${dto.transactions.length} transações importadas com sucesso`,
      count: dto.transactions.length,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private async applyCategorySuggestions(
    userId: string,
    transactions: ParsedTransaction[],
  ): Promise<{ transactions: ParsedTransaction[]; usage: TokenUsage }> {
    const names = transactions.map((t) => t.name);

    if (names.length === 0) {
      return { transactions, usage: { inputTokens: 0, outputTokens: 0 } };
    }

    const categories = await this.categoriesRepo.findMany({
      where: { userId, type: 'EXPENSE' },
      select: { id: true, name: true },
    });

    if (categories.length === 0) {
      return { transactions, usage: { inputTokens: 0, outputTokens: 0 } };
    }

    const { mapping, usage } = await this.callCategoryAI(
      names,
      categories as { id: string; name: string }[],
    );

    return {
      transactions: transactions.map((t) => ({
        ...t,
        suggestedCategoryId: mapping[t.name] ?? undefined,
      })),
      usage,
    };
  }

  private async callCategoryAI(
    names: string[],
    categories: { id: string; name: string }[],
  ): Promise<{ mapping: Record<string, string>; usage: TokenUsage }> {
    const categoryList = categories
      .map((c) => `- ${c.name} (id: ${c.id})`)
      .join('\n');

    const unique = [...new Set(names)];
    const transactionList = unique.map((n) => `- ${n}`).join('\n');

    const prompt = `You are classifying Brazilian credit card transactions into personal finance categories.

Use semantic understanding — category names vary per user ("Mercado", "Supermercado", "Compras" can all map to a supermarket purchase). Match based on what the merchant sells, not text similarity. Every transaction MUST receive a category.

User's categories:
${categoryList}

Transactions to classify:
${transactionList}

Return ONLY a valid JSON object where each key is the exact transaction name and the value is the category ID.
No markdown, no explanation, no extra text.
Example: {"Max Atacadista":"<category-id>","Netflix":"<category-id>"}`;

    const response = await this.anthropic.messages.create({
      model: env.anthropicModel ?? 'claude-haiku-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const usage: TokenUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };

    const textBlock = response.content.find((b) => b.type === 'text');
    const raw = textBlock?.type === 'text' ? textBlock.text : '{}';

    const cleaned = raw
      .replace(/```(?:json)?\s*/g, '')
      .replace(/```/g, '')
      .trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      try {
        return { mapping: JSON.parse(jsonMatch[0]) as Record<string, string>, usage };
      } catch {
        // AI returned malformed JSON — return empty, no categories assigned
      }
    }

    return { mapping: {}, usage };
  }

  // ─── AI extraction fallback (non-Nubank PDFs) ────────────────────────────────

  private async extractWithAI(
    invoiceText: string,
  ): Promise<{ transactions: ParsedTransaction[]; usage: TokenUsage }> {
    const prompt = `You are parsing a Brazilian credit card statement. Extract every purchase transaction and return a JSON array.

Each object: { "name": string, "value": number, "date": "YYYY-MM-DD" }
- value: positive number (R$ 32,67 → 32.67; R$ 1.234,56 → 1234.56)
- date: YYYY-MM-DD (02 FEV 2026 → 2026-02-02; JAN=01 FEV=02 MAR=03 ABR=04 MAI=05 JUN=06 JUL=07 AGO=08 SET=09 OUT=10 NOV=11 DEZ=12)
- Skip lines with negative amounts, payments, credits, fees, interest.

Return ONLY the raw JSON array. No markdown.

Statement:
${invoiceText.slice(0, 20000)}`;

    const response = await this.anthropic.messages.create({
      model: env.anthropicModel ?? 'claude-haiku-4-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const usage: TokenUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };

    const textBlock = response.content.find((b) => b.type === 'text');
    const raw = textBlock?.type === 'text' ? textBlock.text : '[]';
    const cleaned = raw
      .replace(/```(?:json)?\s*/g, '')
      .replace(/```/g, '')
      .trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { transactions: [], usage };

    try {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>[];
      return {
        transactions: parsed
          .map((t) => ({
            name: String(t.name ?? '').trim(),
            value:
              typeof t.value === 'number'
                ? t.value
                : parseFloat(
                    String(t.value ?? '0')
                      .replace(/[R$\s]/g, '')
                      .replace(/\./g, '')
                      .replace(',', '.'),
                  ),
            date: String(t.date ?? '').trim(),
          }))
          .filter(
            (t) =>
              t.name.length > 0 &&
              !isNaN(t.value) &&
              t.value > 0 &&
              t.date.length > 0,
          ),
        usage,
      };
    } catch {
      return { transactions: [], usage };
    }
  }
}
