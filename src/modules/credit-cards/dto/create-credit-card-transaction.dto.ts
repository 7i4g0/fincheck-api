import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateCreditCardTransactionDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome da transação é obrigatório' })
  name: string;

  @IsNumber()
  @IsNotEmpty({ message: 'O valor é obrigatório' })
  @Min(0.01, { message: 'O valor deve ser maior que 0' })
  value: number;

  @IsDateString()
  @IsNotEmpty({ message: 'A data é obrigatória' })
  date: string;

  @IsUUID()
  @IsNotEmpty({ message: 'O cartão é obrigatório' })
  creditCardId: string;

  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  installments?: number;
}
