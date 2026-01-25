import { Injectable } from '@nestjs/common';
import { CreditCardsRepository } from '@/shared/database/repositories/credit-cards.repositories';
import { CreditCardTransactionsRepository } from '@/shared/database/repositories/credit-card-transactions.repositories';
import { CreateCreditCardDto } from '../dto/create-credit-card.dto';
import { UpdateCreditCardDto } from '../dto/update-credit-card.dto';
import { VerifyCreditCardOwnershipService } from './verify-credit-card-ownership.service';

@Injectable()
export class CreditCardsService {
  constructor(
    private readonly creditCardsRepo: CreditCardsRepository,
    private readonly creditCardTransactionsRepo: CreditCardTransactionsRepository,
    private readonly verifyCreditCardOwnership: VerifyCreditCardOwnershipService,
  ) {}

  create(userId: string, createCreditCardDto: CreateCreditCardDto) {
    const { name, color, limit, closingDay, dueDay, defaultBankAccountId } =
      createCreditCardDto;

    return this.creditCardsRepo.create({
      data: {
        userId,
        name,
        color,
        limit,
        closingDay,
        dueDay,
        defaultBankAccountId,
      },
    });
  }

  async findAllByUserId(userId: string) {
    const creditCards = await this.creditCardsRepo.findMany({
      where: { userId },
      include: {
        transactions: {
          select: {
            value: true,
            date: true,
          },
        },
      },
    });

    return creditCards.map((card) => {
      // Calculate current invoice total (transactions not yet paid)
      const totalInvoice = card.transactions.reduce(
        (acc, t) => acc + t.value,
        0,
      );

      return {
        ...card,
        totalInvoice,
        availableLimit: card.limit - totalInvoice,
      };
    });
  }

  async update(
    userId: string,
    creditCardId: string,
    updateCreditCardDto: UpdateCreditCardDto,
  ) {
    await this.verifyCreditCardOwnership.validate(userId, creditCardId);

    const { name, color, limit, closingDay, dueDay, defaultBankAccountId } =
      updateCreditCardDto;

    return this.creditCardsRepo.update({
      where: { id: creditCardId },
      data: { name, color, limit, closingDay, dueDay, defaultBankAccountId },
    });
  }

  async remove(userId: string, creditCardId: string) {
    await this.verifyCreditCardOwnership.validate(userId, creditCardId);

    await this.creditCardsRepo.delete({
      where: { id: creditCardId },
    });

    return null;
  }

  // Get invoice for a specific month/year
  async getInvoice(
    userId: string,
    creditCardId: string,
    month: number,
    year: number,
  ) {
    await this.verifyCreditCardOwnership.validate(userId, creditCardId);

    const card = await this.creditCardsRepo.findFirst({
      where: { id: creditCardId, userId },
    });

    if (!card) {
      return null;
    }

    // Calculate invoice period based on closing day
    // Invoice closes on closingDay of the month and is due on dueDay
    const closingDate = new Date(year, month - 1, card.closingDay, 23, 59, 59);
    const previousClosingDate = new Date(
      year,
      month - 2,
      card.closingDay,
      0,
      0,
      0,
    );

    const transactions = await this.creditCardTransactionsRepo.findMany({
      where: {
        creditCardId,
        userId,
        date: {
          gt: previousClosingDate,
          lte: closingDate,
        },
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            icon: true,
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    const total = transactions.reduce((acc, t) => acc + t.value, 0);
    const dueDate = new Date(year, month - 1, card.dueDay);

    return {
      creditCard: card,
      month,
      year,
      closingDate,
      dueDate,
      transactions,
      total,
    };
  }
}
