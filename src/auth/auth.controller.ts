import {
  Controller,
  Post,
  Body,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEmail,
  Length,
  IsIn,
  Min,
  IsPositive,
  IsInt,
  IsOptional,
} from 'class-validator';
import { AuthService } from './auth.service';

// DTOs

class RequestOtpDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

class VerifyOtpDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  otp: string;
}

class RegisterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  @IsNotEmpty()
  groupName: string;

  @IsInt()
  @IsPositive()
  @Min(1)
  cycleAmount: number;

  @IsString()
  @IsNotEmpty()
  @IsIn(['weekly', 'monthly'])
  cycleInterval: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({
    summary: 'Register',
    description: 'Create a new collector account and savings group',
  })
  @Post('register')
  @HttpCode(201)
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @ApiOperation({
    summary: 'Request OTP',
    description: 'Send a 6-digit login code to the collector email address',
  })
  @Post('request-otp')
  @HttpCode(200) // override NestJS default of 201 for POST
  async requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto.email);
  }

  @ApiOperation({
    summary: 'Verify OTP',
    description: 'Verify the 6-digit code and receive a JWT access token',
  })
  @Post('verify-otp')
  @HttpCode(200)
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto.email, dto.otp);
  }
}