import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsString,
  ValidateNested,
} from 'class-validator';

export class AvailabilityItemDto {
  @IsString()
  id!: string;

  @IsBoolean()
  isOpen!: boolean;
}

export class UpdateAvailabilitiesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AvailabilityItemDto)
  items!: AvailabilityItemDto[];
}
