import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePaymentIntentDto {
    @IsString()
    @IsNotEmpty()
    bookingId!: string;
}