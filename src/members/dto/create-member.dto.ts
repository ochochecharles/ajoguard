import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsMobilePhone,
  IsEmail,
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

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsUUID()
  @IsNotEmpty()
  groupId: string;

  @IsEnum(MemberRole)
  @IsOptional()
  role?: MemberRole;
}
