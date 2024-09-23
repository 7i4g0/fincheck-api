import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

export const ActiveUserId = createParamDecorator<undefined>(
  (data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest();
    const userId = request.userId;

    if (!userId) {
      throw new UnauthorizedException();
    }

    return userId;
  },
);
