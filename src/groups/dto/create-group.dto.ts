import { IsString, IsNotEmpty, IsInt, IsPositive, IsOptional, Min } from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @IsPositive()
  @Min(1) // minimum 100 kobo = ₦1
  cycleAmount: number;

  @IsString()
  @IsNotEmpty()
  cycleInterval: string; // "weekly" or "monthly"
}