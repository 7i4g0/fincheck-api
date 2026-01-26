-- AlterTable: Add default_bank_account_id to credit_cards
ALTER TABLE "credit_cards" ADD COLUMN "default_bank_account_id" UUID;

-- AlterTable: Add invoice fields to transactions
ALTER TABLE "transactions" ADD COLUMN "credit_card_id" UUID;
ALTER TABLE "transactions" ADD COLUMN "invoice_month" INTEGER;
ALTER TABLE "transactions" ADD COLUMN "invoice_year" INTEGER;

-- CreateIndex: Unique constraint for invoice transactions
CREATE UNIQUE INDEX "transactions_credit_card_id_invoice_month_invoice_year_key" ON "transactions"("credit_card_id", "invoice_month", "invoice_year");

-- AddForeignKey: credit_cards -> bank_accounts
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_default_bank_account_id_fkey" FOREIGN KEY ("default_bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: transactions -> credit_cards (for invoice)
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_credit_card_id_fkey" FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
