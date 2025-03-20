import { TransactionsRepository } from '@/shared/database/repositories/transactions.repositories';
import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class VerifyTransactionOwnershipService {
  constructor(private readonly transactionsRepo: TransactionsRepository) {}

  async validate(userId: string, transactionId: string) {
    const isOwner = await this.transactionsRepo.findFirst({
      where: {
        id: transactionId,
        userId,
      },
    });

    if (!isOwner) {
      throw new NotFoundException('Transaction not found');
    }
  }
}
