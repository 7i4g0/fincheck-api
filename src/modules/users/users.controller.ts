import { Controller, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import { ActiveUserId } from '../../shared/decorators/ActiveUserId';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get('/me')
  me(@ActiveUserId() userId: string) {
    return this.usersService.getUserById(userId);
  }

  @Patch('/me/onboarding/complete')
  @HttpCode(HttpStatus.OK)
  completeOnboarding(@ActiveUserId() userId: string) {
    return this.usersService.completeOnboarding(userId);
  }
}
