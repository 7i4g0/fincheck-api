import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class MatchInvoiceItemDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório' })
  name: string;

  @IsNumber()
  @Min(0.01, { message: 'O valor deve ser maior que 0' })
  value: number;

  @IsDateString()
  @IsNotEmpty({ message: 'A data é obrigatória' })
  date: string;
}

export class MatchInvoiceTransactionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatchInvoiceItemDto)
  transactions: MatchInvoiceItemDto[];
}
