import { IsUUID, IsNotEmpty } from 'class-validator';

export class RecordPayoutDto {
  @IsUUID()
  @IsNotEmpty()
  recipientId: string;
}
