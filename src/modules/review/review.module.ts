import { Module } from '@nestjs/common';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import { TeachersModule } from '@/modules/teachers/teachers.module';

@Module({
  imports: [TeachersModule],
  controllers: [ReviewController],
  providers: [ReviewService],
})
export class ReviewModule {}
