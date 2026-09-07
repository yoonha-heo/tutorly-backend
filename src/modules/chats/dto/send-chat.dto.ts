import { IsNotEmpty, IsString } from 'class-validator';

export class SendChatDto {
  @IsString()
  @IsNotEmpty()
  recipientId!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;
}
