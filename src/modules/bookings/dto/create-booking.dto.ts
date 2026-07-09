import { LessonType } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class CreateBookingDto {
  @IsString()
  availabilityId: string;

  @IsEnum(LessonType)
  lessonType: LessonType;
}
