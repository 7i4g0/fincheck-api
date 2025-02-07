import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';
import { TransactionType } from '../entities/Transaction';

export class CreateTransactionDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  bankAccountId: string;

  @IsString()
  @IsNotEmpty()
  @IsUUID()
  categoryId: string;

  @IsString()
  @IsNotEmpty({ message: 'O nome da transação é obrigatório' })
  name: string;

  @IsNumber()
  @IsNotEmpty()
  @IsPositive({ message: 'O valor deve ser positivo' })
  value: number;

  @IsNotEmpty()
  @IsDateString()
  date: Date;

  @IsOptional()
  @IsEnum(TransactionType)
  type: TransactionType;
}
