import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsMobilePhone,
} from 'class-validator';

export enum MemberRole {
  MEMBER = 'MEMBER',
  COLLECTOR = 'COLLECTOR',
}

export class CreateMemberDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsMobilePhone()
  phoneNumber?: string;

  @IsUUID()
  @IsNotEmpty()
  groupId: string;

  @IsEnum(MemberRole)
  @IsOptional()
  role?: MemberRole;
}