import { IsArray, IsInt, IsString } from 'class-validator';

export class TeacherProfileDto {
  @IsString()
  headline: string;

  @IsString()
  bio: string;

  @IsInt()
  hourlyRate: number;

  @IsArray()
  languageIds: string[];

  @IsArray()
  specialtyIds: string[];
}
