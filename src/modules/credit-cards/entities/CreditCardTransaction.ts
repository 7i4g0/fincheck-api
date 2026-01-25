export class CreditCardTransaction {
  id: string;
  userId: string;
  creditCardId: string;
  categoryId: string | null;
  name: string;
  value: number;
  date: Date;
  installments: number;
  currentInstallment: number;
  installmentGroupId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
