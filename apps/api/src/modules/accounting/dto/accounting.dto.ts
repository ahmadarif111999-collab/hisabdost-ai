import { AccountType } from '@prisma/client';
import { IsArray, IsEnum, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSaleDto {
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsIn(['cash', 'bank', 'wallet', 'credit'])
  paymentMethod?: 'cash' | 'bank' | 'wallet' | 'credit';

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  accountCode?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreatePurchaseDto {
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsIn(['cash', 'bank', 'wallet', 'payable'])
  paymentMethod?: 'cash' | 'bank' | 'wallet' | 'payable';

  @IsOptional()
  @IsString()
  vendorName?: string;

  @IsOptional()
  @IsString()
  accountCode?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  documentId?: string;
}

export class CreateExpenseDto {
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsIn(['cash', 'bank', 'wallet', 'payable'])
  paymentMethod?: 'cash' | 'bank' | 'wallet' | 'payable';

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  accountCode?: string;

  @IsOptional()
  @IsString()
  vendorName?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  documentId?: string;
}

export class CreatePaymentDto {
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsIn(['cash', 'bank', 'wallet'])
  paymentMethod!: 'cash' | 'bank' | 'wallet';

  @IsOptional()
  @IsString()
  partyName?: string;

  @IsOptional()
  @IsString()
  partyId?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateAccountDto {
  @IsString()
  name!: string;

  @IsEnum(AccountType)
  type!: AccountType;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  requiresReview?: boolean;
}

export class JournalLineDto {
  @IsString()
  accountId!: string;

  @IsNumber()
  debit!: number;

  @IsNumber()
  credit!: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateJournalEntryDto {
  @IsString()
  narration!: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];
}

export class ReportFilterDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsArray()
  accountCodes?: string[];

  @IsOptional()
  @IsArray()
  accountIds?: string[];

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  vendorId?: string;

  @IsOptional()
  @IsString()
  paymentStatus?: string;

  @IsOptional()
  @IsString()
  documentStatus?: string;

  @IsOptional()
  @IsString()
  approvalStatus?: string;

  @IsOptional()
  @IsNumber()
  minAmount?: number;

  @IsOptional()
  @IsNumber()
  maxAmount?: number;
}

export class ExportReportDto extends ReportFilterDto {
  @IsString()
  reportType!: string;

  @IsIn(['excel', 'csv', 'pdf', 'word', 'docx', 'json'])
  format!: 'excel' | 'csv' | 'pdf' | 'word' | 'docx' | 'json';
}

export class RequestReportExportDto extends ExportReportDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
