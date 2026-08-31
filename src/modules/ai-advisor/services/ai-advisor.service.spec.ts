/// <reference types="jest" />

import { APIError } from '@anthropic-ai/sdk';
import { HttpException, Logger } from '@nestjs/common';

jest.mock('../../../shared/config/env', () => ({
  env: { anthropicApiKey: 'test-key', anthropicModel: 'claude-haiku-4-5' },
}));

import { AiAdvisorService } from './ai-advisor.service';

describe('AiAdvisorService', () => {
  const financialContext = { buildContext: jest.fn() };
  const usageTracking = { track: jest.fn() };

  let service: AiAdvisorService;
  let createMessage: jest.Mock;

  const dto = {
    messages: [{ role: 'user' as const, content: 'Posso comprar um celular?' }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    financialContext.buildContext.mockResolvedValue('=== CONTEXTO ===');
    usageTracking.track.mockResolvedValue(undefined);

    service = new AiAdvisorService(
      financialContext as never,
      usageTracking as never,
    );

    createMessage = jest.fn();
    service['anthropic'].messages.create = createMessage as never;
  });

  test('returns the assistant message and tracks usage', async () => {
    createMessage.mockResolvedValue({
      content: [{ type: 'text', text: 'Melhor esperar, meu filho.' }],
      usage: { input_tokens: 120, output_tokens: 30 },
      stop_reason: 'end_turn',
    });

    await expect(service.chat('user-1', dto)).resolves.toEqual({
      message: 'Melhor esperar, meu filho.',
    });
    expect(usageTracking.track).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', inputTokens: 120 }),
    );
  });

  test('does not fail the request when usage tracking rejects', async () => {
    createMessage.mockResolvedValue({
      content: [{ type: 'text', text: 'Oi, filho!' }],
      usage: { input_tokens: 10, output_tokens: 5 },
      stop_reason: 'end_turn',
    });
    usageTracking.track.mockRejectedValue(new Error('db offline'));

    await expect(service.chat('user-1', dto)).resolves.toEqual({
      message: 'Oi, filho!',
    });
  });

  test('maps rate limit failures to 429 with a friendly message', async () => {
    createMessage.mockRejectedValue(
      new APIError(
        429,
        { error: { type: 'rate_limit_error' } },
        'rate limit',
        undefined,
      ),
    );

    const error = await service.chat('user-1', dto).catch((e) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(429);
    expect(error.message).toContain('limite de mensagens');
  });

  test('maps billing failures to 503 without leaking provider details', async () => {
    createMessage.mockRejectedValue(
      new APIError(
        400,
        { error: { type: 'invalid_request_error' } },
        'Your credit balance is too low to access the Anthropic API.',
        undefined,
      ),
    );

    const error = await service.chat('user-1', dto).catch((e) => e);

    expect(error.getStatus()).toBe(503);
    expect(error.message).toBe(
      'A Mainha está indisponível neste momento. Tente novamente em alguns minutos.',
    );
    expect(error.message).not.toContain('credit balance');
  });

  test('maps connection failures to 504', async () => {
    createMessage.mockRejectedValue(
      new APIError(undefined, undefined, 'Request timed out.', undefined),
    );

    const error = await service.chat('user-1', dto).catch((e) => e);

    expect(error.getStatus()).toBe(504);
  });

  test('rejects when the model returns no text content', async () => {
    createMessage.mockResolvedValue({
      content: [],
      usage: { input_tokens: 10, output_tokens: 0 },
      stop_reason: 'max_tokens',
    });

    const error = await service.chat('user-1', dto).catch((e) => e);

    expect(error.getStatus()).toBe(503);
  });
});
