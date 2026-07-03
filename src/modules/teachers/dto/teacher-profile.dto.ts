import { IsArray, IsInt, IsString } from 'class-validator';

export class TeacherProfileDto {
  @IsString()
  headline: string;

  @IsString()
  bio: string;

  @IsString()
  profileImageUrl: string;

  @IsInt()
  hourlyRate: number;

  @IsArray()
  languages: string[];

  @IsArray()
  specialties: string[];
}
