import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ActiveUserId } from '../../shared/decorators/ActiveUserId';
import { CreateCreditCardDto } from './dto/create-credit-card.dto';
import { UpdateCreditCardDto } from './dto/update-credit-card.dto';
import { CreateCreditCardTransactionDto } from './dto/create-credit-card-transaction.dto';
import { UpdateCreditCardTransactionDto } from './dto/update-credit-card-transaction.dto';
import { CreditCardsService } from './services/credit-cards.service';
import { CreditCardTransactionsService } from './services/credit-card-transactions.service';

@Controller('credit-cards')
export class CreditCardsController {
  constructor(
    private readonly creditCardsService: CreditCardsService,
    private readonly creditCardTransactionsService: CreditCardTransactionsService,
  ) {}

  // ===== Credit Cards CRUD =====

  @Get()
  findAll(@ActiveUserId() userId: string) {
    return this.creditCardsService.findAllByUserId(userId);
  }

  @Post()
  create(
    @ActiveUserId() userId: string,
    @Body() createCreditCardDto: CreateCreditCardDto,
  ) {
    return this.creditCardsService.create(userId, createCreditCardDto);
  }

  @Put(':creditCardId')
  update(
    @ActiveUserId() userId: string,
    @Param('creditCardId', ParseUUIDPipe) creditCardId: string,
    @Body() updateCreditCardDto: UpdateCreditCardDto,
  ) {
    return this.creditCardsService.update(
      userId,
      creditCardId,
      updateCreditCardDto,
    );
  }

  @Delete(':creditCardId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @ActiveUserId() userId: string,
    @Param('creditCardId', ParseUUIDPipe) creditCardId: string,
  ) {
    return this.creditCardsService.remove(userId, creditCardId);
  }

  // ===== Invoice =====

  @Get(':creditCardId/invoice')
  getInvoice(
    @ActiveUserId() userId: string,
    @Param('creditCardId', ParseUUIDPipe) creditCardId: string,
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
  ) {
    return this.creditCardsService.getInvoice(
      userId,
      creditCardId,
      month,
      year,
    );
  }

  // ===== Credit Card Transactions =====

  @Get(':creditCardId/transactions')
  findTransactions(
    @ActiveUserId() userId: string,
    @Param('creditCardId', ParseUUIDPipe) creditCardId: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    return this.creditCardTransactionsService.findAllByCardId(
      userId,
      creditCardId,
      {
        month: month ? parseInt(month) : undefined,
        year: year ? parseInt(year) : undefined,
      },
    );
  }

  @Post('transactions')
  createTransaction(
    @ActiveUserId() userId: string,
    @Body() createTransactionDto: CreateCreditCardTransactionDto,
  ) {
    return this.creditCardTransactionsService.create(
      userId,
      createTransactionDto,
    );
  }

  @Put('transactions/:transactionId')
  updateTransaction(
    @ActiveUserId() userId: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @Body() updateTransactionDto: UpdateCreditCardTransactionDto,
  ) {
    return this.creditCardTransactionsService.update(
      userId,
      transactionId,
      updateTransactionDto,
    );
  }

  @Delete('transactions/installments/:installmentGroupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAllInstallments(
    @ActiveUserId() userId: string,
    @Param('installmentGroupId', ParseUUIDPipe) installmentGroupId: string,
  ) {
    return this.creditCardTransactionsService.removeAllInstallments(
      userId,
      installmentGroupId,
    );
  }

  @Delete('transactions/:transactionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTransaction(
    @ActiveUserId() userId: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
  ) {
    return this.creditCardTransactionsService.remove(userId, transactionId);
  }
}
