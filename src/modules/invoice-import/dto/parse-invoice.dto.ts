import { IsNotEmpty, IsString } from 'class-validator';

export class ParseInvoiceDto {
  @IsString()
  @IsNotEmpty({ message: 'O texto do extrato é obrigatório' })
  text: string;
}
