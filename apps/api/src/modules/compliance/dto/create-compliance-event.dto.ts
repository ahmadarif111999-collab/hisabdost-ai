import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateComplianceEventDto {
  @IsString()
  title!: string;

  @IsString()
  authority!: string;

  @IsDateString()
  dueDate!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
