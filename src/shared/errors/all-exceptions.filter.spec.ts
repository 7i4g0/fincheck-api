/// <reference types="jest" />

jest.mock('../config/env', () => ({
  env: { errorNotifyEmail: 'ops@example.com' },
}));

import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  const errorAlert = { notify: jest.fn() };
  const filter = new AllExceptionsFilter(errorAlert as never);

  function createHost(url = '/ai-advisor/chat') {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const response = { status };
    const request = { method: 'POST', url, userId: 'user-1' };

    return {
      host: {
        switchToHttp: () => ({
          getResponse: () => response,
          getRequest: () => request,
        }),
      } as never,
      json,
      status,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  test('keeps the original HTTP response and notifies with the technical cause', () => {
    const { host, json, status } = createHost();
    const exception = new HttpException(
      'A Mainha está indisponível neste momento. Tente novamente em alguns minutos.',
      HttpStatus.SERVICE_UNAVAILABLE,
      { cause: new Error('Your credit balance is too low') },
    );

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'A Mainha está indisponível neste momento. Tente novamente em alguns minutos.',
      }),
    );
    expect(errorAlert.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 503,
        path: '/ai-advisor/chat',
        userId: 'user-1',
        cause: expect.stringContaining('credit balance is too low'),
      }),
    );
  });

  test('treats unexpected errors as 500', () => {
    const { host, status } = createHost('/users');

    filter.catch(new Error('boom'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(errorAlert.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 500,
        path: '/users',
        cause: expect.stringContaining('boom'),
      }),
    );
  });
});
