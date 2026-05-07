import { IsString } from 'class-validator';

export class ParseTransactionDto {
  @IsString()
  message!: string;
}
