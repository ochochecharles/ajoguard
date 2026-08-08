import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsPositive,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  /**
   * Required cycle contribution per member, in NAIRA (integer).
   * Converted to kobo (x100) server-side before storage.
   */
  @IsInt()
  @IsPositive()
  @Min(1) // minimum ₦1
  cycleAmount: number;

  @IsString()
  @IsNotEmpty()
  cycleInterval: string; // "weekly" or "monthly"
}
