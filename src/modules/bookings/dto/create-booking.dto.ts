import { IsString } from 'class-validator';

export class CreateBookingDto {
  @IsString()
  availabilityId: string;
}
