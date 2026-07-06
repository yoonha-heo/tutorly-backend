import { IsOptional, IsString } from 'class-validator';

export class SearchTeachersQueryDto {
  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  specialty?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
