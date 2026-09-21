import { UserRole } from '@prisma/client';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class GoogleLoginDto {
  @IsString()
  @IsNotEmpty()
  idToken!: string;

  @IsIn([UserRole.STUDENT, UserRole.TEACHER])
  role!: UserRole;
}
