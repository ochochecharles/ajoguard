import {
  IsUUID,
  IsInt,
  IsPositive,
  IsNotEmpty,
  IsEnum,
  Min,
  IsOptional,
} from 'class-validator';

export enum ContributionChannel {
  WEB = 'WEB',
  TELEGRAM = 'TELEGRAM',
}

export class CreateContributionDto {
  @IsUUID()
  @IsNotEmpty()
  groupId: string;

  @IsUUID()
  @IsNotEmpty()
  memberId: string;

  @IsUUID()
  @IsOptional()
  collectorId: string;

  /**
   * Contribution amount, in NAIRA (integer).
   * Converted to kobo (x100) server-side before storage.
   */
  @IsInt()
  @IsPositive()
  @Min(1) // minimum ₦1
  amount: number;

  @IsEnum(ContributionChannel)
  channel: ContributionChannel;
}
