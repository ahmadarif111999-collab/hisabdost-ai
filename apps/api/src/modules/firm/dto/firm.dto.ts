import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { CreateBusinessDto } from '../../businesses/dto/create-business.dto';

export class CreateClientBusinessDto extends CreateBusinessDto {
  @IsOptional()
  @IsEmail()
  clientOwnerEmail?: string;
}

export class InviteFirmMemberDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsIn(['FIRM_PARTNER', 'FIRM_MANAGER', 'FIRM_ACCOUNTANT', 'FIRM_STAFF'])
  role?: 'FIRM_PARTNER' | 'FIRM_MANAGER' | 'FIRM_ACCOUNTANT' | 'FIRM_STAFF';
}

export class InviteClientUserDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  role?: string;
}

export class CreateAccountTemplateDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsIn(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'])
  type!: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;
}

export class ApproveAccountHeadRequestDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'])
  type?: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

  @IsOptional()
  @IsString()
  decisionNote?: string;
}

export class RejectRequestDto {
  @IsOptional()
  @IsString()
  decisionNote?: string;
}
