import {
  IsEnum,
  IsHexColor,
  IsNotEmpty,
  IsNumber,
  IsString,
} from 'class-validator';
import { BankAccountType } from '../entities/BankAccount';

export class CreateBankAccountDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome da conta bancária é obrigatório' })
  name: string;

  @IsNumber()
  @IsNotEmpty({ message: 'O saldo inicial é obrigatório' })
  initialBalance: number;

  @IsNotEmpty({ message: 'O tipo da conta bancária é obrigatório' })
  @IsEnum(BankAccountType)
  type: BankAccountType;

  @IsString()
  @IsNotEmpty({ message: 'A cor da conta bancária é obrigatório' })
  @IsHexColor()
  color: string;
}
