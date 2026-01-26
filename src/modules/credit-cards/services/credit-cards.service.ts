import { Injectable } from '@nestjs/common';
import { CreditCardsRepository } from '../../../shared/database/repositories/credit-cards.repositories';
import { CreateCreditCardDto } from '../dto/create-credit-card.dto';
import { UpdateCreditCardDto } from '../dto/update-credit-card.dto';
import { VerifyCreditCardOwnershipService } from './verify-credit-card-ownership.service';
import { VerifyBankAccountOwnershipService } from '../../bank-accounts/services/verify-bank-account-ownership.service';
import { InvoiceService } from './invoice.service';

@Injectable()
export class CreditCardsService {
  constructor(
    private readonly creditCardsRepo: CreditCardsRepository,
    private readonly verifyCreditCardOwnership: VerifyCreditCardOwnershipService,
    private readonly verifyBankAccountOwnership: VerifyBankAccountOwnershipService,
    private readonly invoiceService: InvoiceService,
  ) {}

  async create(userId: string, createCreditCardDto: CreateCreditCardDto) {
    const { name, color, limit, closingDay, dueDay, defaultBankAccountId } =
      createCreditCardDto;

    if (defaultBankAccountId) {
      await this.verifyBankAccountOwnership.validate(
        userId,
        defaultBankAccountId,
      );
    }

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
    const { name, color, limit, closingDay, dueDay, defaultBankAccountId } =
      updateCreditCardDto;

    await Promise.all([
      this.verifyCreditCardOwnership.validate(userId, creditCardId),
      defaultBankAccountId &&
        this.verifyBankAccountOwnership.validate(userId, defaultBankAccountId),
    ]);

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

    // Use InvoiceService to get transactions and date range
    const { transactions, closingDate } =
      await this.invoiceService.getInvoiceTransactions(
        userId,
        creditCardId,
        month,
        year,
        card.closingDay,
        true, // include category
      );

    const total = transactions.reduce((acc, t) => acc + t.value, 0);
    const dueDate = this.invoiceService.calculateDueDate(
      month,
      year,
      card.closingDay,
      card.dueDay,
    );

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
