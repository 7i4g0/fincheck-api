/// <reference types="jest" />

jest.mock('../config/env', () => ({
  env: { errorNotifyEmail: 'ops@example.com' },
}));

import { ErrorAlertService } from './error-alert.service';

describe('ErrorAlertService', () => {
  const emailService = { sendErrorAlert: jest.fn() };
  let service: ErrorAlertService;

  beforeEach(() => {
    jest.clearAllMocks();
    emailService.sendErrorAlert.mockResolvedValue(undefined);
    service = new ErrorAlertService(emailService as never);
  });

  test('notifies operational failures like Anthropic 429', () => {
    service.notify({
      status: 429,
      method: 'POST',
      path: '/ai-advisor/chat',
      userId: 'user-1',
      userMessage: 'limite de mensagens',
      cause: 'rate_limit_error',
    });

    expect(emailService.sendErrorAlert).toHaveBeenCalledTimes(1);
    expect(emailService.sendErrorAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 429,
        path: '/ai-advisor/chat',
        cause: 'rate_limit_error',
      }),
    );
  });

  test('does not notify validation or auth errors', () => {
    service.notify({
      status: 400,
      method: 'POST',
      path: '/ai-advisor/chat',
      userMessage: 'invalid',
      cause: 'BadRequestException',
    });

    expect(emailService.sendErrorAlert).not.toHaveBeenCalled();
  });

  test('deduplicates the same error within the cooldown window', () => {
    const alert = {
      status: 503,
      method: 'POST',
      path: '/ai-advisor/chat',
      userMessage: 'indisponível',
      cause: 'credit balance is too low',
    };

    service.notify(alert);
    service.notify(alert);

    expect(emailService.sendErrorAlert).toHaveBeenCalledTimes(1);
  });
});
