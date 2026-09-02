import { Module } from '@nestjs/common';
import { AuthModule } from '../../modules/auth/auth.module';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { ErrorAlertService } from './error-alert.service';

@Module({
  imports: [AuthModule],
  providers: [ErrorAlertService, AllExceptionsFilter],
  exports: [ErrorAlertService, AllExceptionsFilter],
})
export class ErrorAlertModule {}
