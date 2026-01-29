import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { TransactionType } from '../entities/Transaction';

export class CreateTransactionDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  bankAccountId: string;

  @ValidateIf((o) => o.type === TransactionType.TRANSFER)
  @IsString()
  @IsNotEmpty({
    message: 'A conta de destino é obrigatória para transferências',
  })
  @IsUUID()
  destinationBankAccountId?: string;

  @ValidateIf((o) => o.type !== TransactionType.TRANSFER)
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  categoryId?: string;

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

  @IsNotEmpty()
  @IsEnum(TransactionType)
  type: TransactionType;
}
