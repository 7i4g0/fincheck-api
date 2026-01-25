import { Injectable, NotFoundException } from '@nestjs/common';
import { CreditCardsRepository } from '@/shared/database/repositories/credit-cards.repositories';

@Injectable()
export class VerifyCreditCardOwnershipService {
  constructor(private readonly creditCardsRepo: CreditCardsRepository) {}

  async validate(userId: string, creditCardId: string) {
    const isOwner = await this.creditCardsRepo.findFirst({
      where: {
        id: creditCardId,
        userId,
      },
    });

    if (!isOwner) {
      throw new NotFoundException('Cartão de crédito não encontrado.');
    }
  }
}
