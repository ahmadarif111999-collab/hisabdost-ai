import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ApproveReceiptDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  amount?: number;

  @IsOptional()
  @IsString()
  date?: string;

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
  @IsIn(['cash', 'bank', 'wallet', 'payable'])
  paymentMethod?: 'cash' | 'bank' | 'wallet' | 'payable';

  @IsOptional()
  @IsIn(['expense', 'purchase'])
  kind?: 'expense' | 'purchase';

  @IsOptional()
  @IsString()
  description?: string;
}

export class ManualReceiptDto extends ApproveReceiptDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
