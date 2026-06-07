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
  @IsOptional()
  collectorId: string;

  @IsInt()
  @IsPositive()
  @Min(1) // minimum ₦1
  amount: number;

  @IsEnum(ContributionChannel)
  channel: ContributionChannel;
}