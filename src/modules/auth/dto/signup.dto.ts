import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
} from 'class-validator';

export const PRIVACY_POLICY_VERSION = '1.0';

export class SignupDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório' })
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @IsBoolean({ message: 'É necessário aceitar a Política de Privacidade' })
  @IsNotEmpty({ message: 'É necessário aceitar a Política de Privacidade' })
  acceptPrivacy: boolean;

  @IsString()
  @IsNotEmpty({ message: 'O token do reCAPTCHA é obrigatório' })
  recaptchaToken: string;
}
