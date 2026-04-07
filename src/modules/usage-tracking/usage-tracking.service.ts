import { Injectable } from '@nestjs/common';
import { FeatureType } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';

interface TrackUsageParams {
  userId: string;
  feature: FeatureType;
  model: string;
  inputTokens: number;
  outputTokens: number;
  metadata?: Record<string, string | number | boolean | null>;
}

// Approximate pricing per million tokens (USD)
// Verify current pricing at https://www.anthropic.com/pricing
const COST_PER_MILLION: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 0.8, output: 4.0 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4.0 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4.0 },
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-5-20251001': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
};

@Injectable()
export class UsageTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  async track(params: TrackUsageParams): Promise<void> {
    const pricing = COST_PER_MILLION[params.model];
    const costUsd = pricing
      ? (params.inputTokens / 1_000_000) * pricing.input +
        (params.outputTokens / 1_000_000) * pricing.output
      : 0;

    await this.prisma.featureUsageEvent.create({
      data: {
        userId: params.userId,
        feature: params.feature,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        costUsd,
        metadata: params.metadata ?? null,
      },
    });
  }
}
