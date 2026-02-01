import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Put,
} from '@nestjs/common';
import { ActiveUserId } from '../../shared/decorators/ActiveUserId';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
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

  @Put('/me')
  @HttpCode(HttpStatus.OK)
  updateProfile(
    @ActiveUserId() userId: string,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(userId, updateProfileDto);
  }

  @Put('/me/password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @ActiveUserId() userId: string,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(userId, changePasswordDto);
  }

  @Patch('/me/onboarding/complete')
  @HttpCode(HttpStatus.OK)
  completeOnboarding(@ActiveUserId() userId: string) {
    return this.usersService.completeOnboarding(userId);
  }
}
