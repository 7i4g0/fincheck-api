import { ConflictException, Injectable } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { UsersRepository } from 'src/shared/database/repositories/users.repositories';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepo: UsersRepository) {}

  async create(createUserDto: CreateUserDto) {
    const userExists = await this.usersRepo.findUnique({
      where: { email: createUserDto.email },
    });

    if (userExists) {
      throw new ConflictException('Este email já está sendo utilizado');
    }

    const hashedPassword = await hash(createUserDto.password, 10);

    const user = await this.usersRepo.create({
      data: {
        ...createUserDto,
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

    return user;
  }

  findAll() {
    return `This action returns all users`;
  }

  findOne(id: number) {
    return `This action returns a #${id} user`;
  }

  // update(id: number, updateUserDto: UpdateUserDto) {
  //   return `This action updates a #${id} user`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} user`;
  // }
}
