import { IsOptional, IsString } from 'class-validator';

export class SuggestAccountHeadDto {
  @IsString()
  prompt!: string;
}

export class AnalyzeReportDto {
  @IsOptional()
  @IsString()
  reportType?: string;
}
