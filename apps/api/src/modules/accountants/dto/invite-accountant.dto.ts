import { IsEmail, IsOptional, IsString } from 'class-validator';

export class InviteAccountantDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  accessLevel?: string;
}
