import {
  IsUUID,
  IsInt,
  IsPositive,
  IsNotEmpty,
  IsEnum,
  Min,
} from 'class-validator';

export enum ContributionChannel {
  SMS = 'SMS',
  WHATSAPP = 'WHATSAPP',
  WEB = 'WEB',
}

export class CreateContributionDto {
  @IsUUID()
  @IsNotEmpty()
  groupId: string;

  @IsUUID()
  @IsNotEmpty()
  memberId: string;

  @IsUUID()
  @IsNotEmpty()
  collectorId: string;

  @IsInt()
  @IsPositive()
  @Min(1) // minimum ₦1
  amount: number;

  @IsEnum(ContributionChannel)
  channel: ContributionChannel;
}