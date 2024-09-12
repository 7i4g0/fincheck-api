import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { UsersRepository } from 'src/shared/database/repositories/users.repositories';
import { SigninDto } from './dto/signin.dto';
import { SignupDto } from './dto/signup.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly jwtService: JwtService,
  ) {}

  async signin(signinDto: SigninDto) {
    const { email, password } = signinDto;

    const user = await this.usersRepo.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    const passwordMatch = await compare(password, user.password);

    if (!passwordMatch) {
      throw new UnauthorizedException('Senha inválida');
    }

    const accessToken = await this.generateAccessToken(user);

    return { accessToken };
  }

  async signup(signupDto: SignupDto) {
    const userExists = await this.usersRepo.findUnique({
      where: { email: signupDto.email },
    });

    if (userExists) {
      throw new ConflictException('Este email já está sendo utilizado');
    }

    const hashedPassword = await hash(signupDto.password, 10);

    const user = await this.usersRepo.create({
      data: {
        ...signupDto,
        password: hashedPassword,
        categories: {
          create: [
            // Income
            { name: 'Salário', icon: 'salary', type: 'INCOME' },
            { name: 'Freelance', icon: 'freelance', type: 'INCOME' },
            { name: 'Outro', icon: 'other', type: 'INCOME' },
            // Expense
            { name: 'Casa', icon: 'home', type: 'EXPENSE' },
            { name: 'Alimentação', icon: 'food', type: 'EXPENSE' },
            { name: 'Educação', icon: 'education', type: 'EXPENSE' },
            { name: 'Lazer', icon: 'fun', type: 'EXPENSE' },
            { name: 'Mercado', icon: 'grocery', type: 'EXPENSE' },
            { name: 'Roupas', icon: 'clothes', type: 'EXPENSE' },
            { name: 'Transporte', icon: 'transport', type: 'EXPENSE' },
            { name: 'Viagem', icon: 'travel', type: 'EXPENSE' },
            { name: 'Outro', icon: 'other', type: 'EXPENSE' },
          ],
        },
      },
    });

    const accessToken = await this.generateAccessToken(user);

    return { accessToken };
  }

  private generateAccessToken(user: User) {
    return this.jwtService.signAsync({
      sub: user.id,
      name: user.name,
      email: user.email,
    });
  }
}
