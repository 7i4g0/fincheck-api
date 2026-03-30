import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ActiveUserId } from '../../shared/decorators/ActiveUserId';
import { ConfirmInvoiceImportDto } from './dto/confirm-invoice-import.dto';
import { ParseInvoiceDto } from './dto/parse-invoice.dto';
import { SuggestCategoriesDto } from './dto/suggest-categories.dto';
import { InvoiceImportService } from './services/invoice-import.service';

@Controller('credit-cards')
export class InvoiceImportController {
  constructor(private readonly invoiceImportService: InvoiceImportService) {}

  /** PDF flow: extract transactions + suggest categories in one shot */
  @Post(':creditCardId/import/parse')
  parseInvoice(
    @ActiveUserId() userId: string,
    @Param('creditCardId', ParseUUIDPipe) creditCardId: string,
    @Body() dto: ParseInvoiceDto,
  ) {
    return this.invoiceImportService.parseInvoiceText(userId, creditCardId, dto.text);
  }

  /** CSV flow: transactions already parsed in the browser, just need categories */
  @Post(':creditCardId/import/categorize')
  suggestCategories(
    @ActiveUserId() userId: string,
    @Param('creditCardId', ParseUUIDPipe) creditCardId: string,
    @Body() dto: SuggestCategoriesDto,
  ) {
    return this.invoiceImportService.suggestCategories(userId, dto.names);
  }

  @Post('import/confirm')
  confirmImport(
    @ActiveUserId() userId: string,
    @Body() dto: ConfirmInvoiceImportDto,
  ) {
    return this.invoiceImportService.confirmImport(userId, dto);
  }
}
