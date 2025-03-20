import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsString, NotEquals, validateSync } from 'class-validator';

class Env {
  @IsString()
  @IsNotEmpty({ message: 'DATABASE_URL é obrigatória' })
  dbURL: string;

  @IsString()
  @IsNotEmpty({ message: 'JWT_SECRET é obrigatória' })
  @NotEquals('unsecure_jwt_secret')
  jwtSecret: string;
}

export const env: Env = plainToInstance(Env, {
  dbURL: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
});

const errors = validateSync(env);

if (errors.length > 0) {
  throw new Error(
    `Erro de validação das variáveis de ambiente:\n${errors
      .map((error) => Object.values(error.constraints).join(', '))
      .join('\n')}`,
  );
}
