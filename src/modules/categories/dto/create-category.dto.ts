import { TransactionType } from '@/modules/transactions/entities/Transaction';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

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
}
