import Anthropic from '@anthropic-ai/sdk';
import { Injectable, NotFoundException } from '@nestjs/common';
import { FeatureType } from '@prisma/client';
import { env } from '../../../shared/config/env';
import { CategoriesRepository } from '../../../shared/database/repositories/categories.repositories';
import { CreditCardTransactionsRepository } from '../../../shared/database/repositories/credit-card-transactions.repositories';
import { CreditCardsRepository } from '../../../shared/database/repositories/credit-cards.repositories';
import { InvoiceService } from '../../credit-cards/services/invoice.service';
import { UsageTrackingService } from '../../usage-tracking/usage-tracking.service';
import { ConfirmInvoiceImportDto } from '../dto/confirm-invoice-import.dto';
import { BankParserRegistry } from './bank-parser.registry';
import {
  AttachedMatch,
  ExistingMatchView,
  matchInvoiceToExisting,
} from './transaction-matcher';

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Keeps each answer small enough that it can never hit the output token cap */
const CATEGORY_BATCH_SIZE = 40;

export interface ParsedTransaction {
  name: string;
  value: number;
  date: string;
  suggestedCategoryId?: string;
  match?: AttachedMatch;
}

export interface InvoiceImportPreview {
  transactions: ParsedTransaction[];
  unmatchedExisting: ExistingMatchView[];
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
  ): Promise<InvoiceImportPreview> {
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
      console.log(
        '[invoice-import] parser=ai-fallback — no regex parser matched',
      );
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

    return this.attachMatches(
      userId,
      creditCardId,
      card.closingDay,
      categorized,
    );
  }

  async matchExistingTransactions(
    userId: string,
    creditCardId: string,
    transactions: ParsedTransaction[],
  ): Promise<InvoiceImportPreview> {
    const card = await this.creditCardsRepo.findFirst({
      where: { id: creditCardId, userId },
    });
    if (!card) throw new NotFoundException('Cartão não encontrado.');

    return this.attachMatches(
      userId,
      creditCardId,
      card.closingDay,
      transactions,
    );
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

    if (dto.transactions.length === 0) {
      return {
        message: 'Nenhuma transação nova para importar',
        count: 0,
      };
    }

    const data = dto.transactions.map((t) => ({
      userId,
      creditCardId: dto.creditCardId,
      categoryId: t.categoryId ?? null,
      name: t.name,
      value: t.value,
      date: this.invoiceService.parseCalendarDate(t.date),
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

  private async attachMatches(
    userId: string,
    creditCardId: string,
    closingDay: number,
    transactions: ParsedTransaction[],
  ): Promise<InvoiceImportPreview> {
    if (transactions.length === 0) {
      return { transactions, unmatchedExisting: [] };
    }

    const periodKeys = new Set<string>();
    const ranges: Array<{ invoiceStart: Date; invoiceEnd: Date }> = [];

    for (const transaction of transactions) {
      const date = this.invoiceService.parseCalendarDate(transaction.date);
      if (Number.isNaN(date.getTime())) continue;

      const { month, year } = this.invoiceService.calculateInvoicePeriod(
        date,
        closingDay,
      );
      const key = `${month}-${year}`;
      if (periodKeys.has(key)) continue;

      periodKeys.add(key);
      ranges.push(
        this.invoiceService.calculateInvoiceDateRange(month, year, closingDay),
      );
    }

    if (ranges.length === 0) {
      return { transactions, unmatchedExisting: [] };
    }

    const existing = await this.creditCardTransactionsRepo.findMany({
      where: {
        userId,
        creditCardId,
        OR: ranges.map((range) => ({
          date: { gte: range.invoiceStart, lt: range.invoiceEnd },
        })),
      },
      select: { id: true, name: true, value: true, date: true },
    });

    const matched = matchInvoiceToExisting(transactions, existing);

    return {
      transactions: matched.transactions.map(({ item, match }) => ({
        ...item,
        match,
      })),
      unmatchedExisting: matched.unmatchedExisting,
    };
  }

  private async applyCategorySuggestions(
    userId: string,
    transactions: ParsedTransaction[],
  ): Promise<{ transactions: ParsedTransaction[]; usage: TokenUsage }> {
    const names = transactions
      .filter((transaction) => transaction.value > 0)
      .map((transaction) => transaction.name);

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
    const unique = [...new Set(names)];

    const batches: string[][] = [];
    for (let i = 0; i < unique.length; i += CATEGORY_BATCH_SIZE) {
      batches.push(unique.slice(i, i + CATEGORY_BATCH_SIZE));
    }

    const results = await Promise.all(
      batches.map((batch, index) =>
        this.classifyBatch(batch, categories, index + 1, batches.length),
      ),
    );

    const mapping: Record<string, string> = {};
    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

    for (const result of results) {
      Object.assign(mapping, result.mapping);
      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
    }

    return { mapping, usage };
  }

  /**
   * Classifies one batch of merchant names. The model answers with position
   * numbers instead of category UUIDs: a UUID costs ~20 output tokens, so
   * echoing names and ids for a full statement overflowed max_tokens and the
   * truncated JSON was unparseable — every transaction came back uncategorized.
   */
  private async classifyBatch(
    names: string[],
    categories: { id: string; name: string }[],
    batchNumber: number,
    batchCount: number,
  ): Promise<{ mapping: Record<string, string>; usage: TokenUsage }> {
    const categoryList = categories
      .map((c, index) => `${index + 1}. ${c.name}`)
      .join('\n');
    const transactionList = names
      .map((name, index) => `${index + 1}. ${name}`)
      .join('\n');

    const prompt = `You are classifying Brazilian credit card transactions into personal finance categories.

Use semantic understanding — category names vary per user ("Mercado", "Supermercado", "Compras" can all map to a supermarket purchase). Match based on what the merchant sells, not text similarity. Every transaction MUST receive a category.

Categories (number. name):
${categoryList}

Transactions (number. name):
${transactionList}

Return ONLY a valid JSON object mapping each transaction number to a category number.
No markdown, no explanation, no extra text.
Example: {"1":3,"2":7}`;

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
    const raw = textBlock?.type === 'text' ? textBlock.text : '';
    const indexMapping = this.parseIndexMapping(raw);

    const mapping: Record<string, string> = {};

    for (const [rawName, rawCategory] of Object.entries(indexMapping)) {
      const name = names[Number(rawName) - 1];
      const category = categories[Number(rawCategory) - 1];
      if (name && category) mapping[name] = category.id;
    }

    console.log(
      `[invoice-import] categories batch=${batchNumber}/${batchCount} ` +
        `mapped=${Object.keys(mapping).length}/${names.length} ` +
        `stop=${response.stop_reason ?? 'unknown'}`,
    );

    return { mapping, usage };
  }

  /**
   * Reads `{"1":3}` pairs one by one so a truncated or partially malformed
   * response still yields the entries the model did manage to emit.
   */
  private parseIndexMapping(raw: string): Record<string, number> {
    const cleaned = raw
      .replace(/```(?:json)?\s*/g, '')
      .replace(/```/g, '')
      .trim();

    const mapping: Record<string, number> = {};
    const pairRe = /"(\d+)"\s*:\s*"?(\d+)"?/g;

    let match: RegExpExecArray | null;
    while ((match = pairRe.exec(cleaned)) !== null) {
      mapping[match[1]] = Number(match[2]);
    }

    return mapping;
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
