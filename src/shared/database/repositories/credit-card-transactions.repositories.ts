import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class CreditCardTransactionsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  create(createDto: Prisma.CreditCardTransactionCreateArgs) {
    return this.prismaService.creditCardTransaction.create(createDto);
  }

  createMany(createManyDto: Prisma.CreditCardTransactionCreateManyArgs) {
    return this.prismaService.creditCardTransaction.createMany(createManyDto);
  }

  findFirst(findFirstDto: Prisma.CreditCardTransactionFindFirstArgs) {
    return this.prismaService.creditCardTransaction.findFirst(findFirstDto);
  }

  findMany<T extends Prisma.CreditCardTransactionFindManyArgs>(
    findManyDto: Prisma.SelectSubset<
      T,
      Prisma.CreditCardTransactionFindManyArgs
    >,
  ) {
    return this.prismaService.creditCardTransaction.findMany<T>(findManyDto);
  }

  update(updateDto: Prisma.CreditCardTransactionUpdateArgs) {
    return this.prismaService.creditCardTransaction.update(updateDto);
  }

  delete(deleteDto: Prisma.CreditCardTransactionDeleteArgs) {
    return this.prismaService.creditCardTransaction.delete(deleteDto);
  }

  deleteMany(deleteManyDto: Prisma.CreditCardTransactionDeleteManyArgs) {
    return this.prismaService.creditCardTransaction.deleteMany(deleteManyDto);
  }
}
