import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateCreditCardDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome do cartão é obrigatório' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'A cor é obrigatória' })
  color: string;

  @IsNumber()
  @Min(0, { message: 'O limite deve ser maior ou igual a 0' })
  limit: number;

  @IsInt()
  @Min(1, { message: 'O dia de fechamento deve ser entre 1 e 28' })
  @Max(28, { message: 'O dia de fechamento deve ser entre 1 e 28' })
  closingDay: number;

  @IsInt()
  @Min(1, { message: 'O dia de vencimento deve ser entre 1 e 28' })
  @Max(28, { message: 'O dia de vencimento deve ser entre 1 e 28' })
  dueDay: number;

  @IsUUID()
  @IsOptional()
  defaultBankAccountId?: string;
}
