import { IsBoolean } from 'class-validator';

export class UpdateAvailabilityDto {
  @IsBoolean()
  isOpen: boolean;
}
