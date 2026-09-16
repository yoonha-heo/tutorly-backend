import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { TeachersModule } from '@/modules/teachers/teachers.module';

@Module({
  imports: [TeachersModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
