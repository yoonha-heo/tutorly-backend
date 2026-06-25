import { TeacherStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateTeacherStatusDto {
  @IsEnum(TeacherStatus)
  status: TeacherStatus;
}
