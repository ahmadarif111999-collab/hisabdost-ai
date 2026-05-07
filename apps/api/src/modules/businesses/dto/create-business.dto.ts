import { EntityType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateBusinessDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  businessType?: string;

  @IsOptional()
  @IsEnum(EntityType)
  entityType?: EntityType;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  ntn?: string;

  @IsOptional()
  @IsString()
  strn?: string;

  @IsOptional()
  @IsBoolean()
  isSalesTaxRegistered?: boolean;

  @IsOptional()
  @IsBoolean()
  isWithholdingAgent?: boolean;

  @IsOptional()
  @IsBoolean()
  isSecpRegistered?: boolean;
}
