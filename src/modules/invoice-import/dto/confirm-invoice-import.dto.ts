import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class ImportedTransactionDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório' })
  name: string;

  @IsNumber()
  @Min(0.01, { message: 'O valor deve ser maior que 0' })
  value: number;

  @IsDateString()
  @IsNotEmpty({ message: 'A data é obrigatória' })
  date: string;

  @IsUUID()
  @IsOptional()
  categoryId?: string;
}

export class ConfirmInvoiceImportDto {
  @IsUUID()
  @IsNotEmpty({ message: 'O cartão é obrigatório' })
  creditCardId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportedTransactionDto)
  transactions: ImportedTransactionDto[];
}
