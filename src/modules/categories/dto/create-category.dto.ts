import { TransactionType } from '../../transactions/entities/Transaction';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome da categoria é obrigatório' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'O ícone da categoria é obrigatório' })
  icon: string;

  @IsEnum(TransactionType)
  @IsNotEmpty({ message: 'O tipo da categoria é obrigatório' })
  type: TransactionType;

  @IsOptional()
  @IsNumber({}, { message: 'O valor estimado deve ser um número' })
  estimatedValue?: number | null;
}
