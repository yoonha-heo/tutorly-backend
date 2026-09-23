import { UserRole } from '@prisma/client';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GoogleLoginDto {
  @IsString()
  @IsNotEmpty()
  idToken!: string;

  @IsOptional()
  @IsIn([UserRole.STUDENT, UserRole.TEACHER])
  role?: UserRole;
}
