import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class UpdateCreditCardTransactionDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome da transação é obrigatório' })
  @IsOptional()
  name?: string;

  @IsNumber()
  @Min(0.01, { message: 'O valor deve ser maior que 0' })
  @IsOptional()
  value?: number;

  @IsDateString()
  @IsOptional()
  date?: string;

  @IsUUID()
  @IsOptional()
  categoryId?: string;
}
