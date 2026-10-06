import { Module } from '@nestjs/common';
import { AvailabilitiesModule } from '@/modules/availabilities/availabilities.module';
import { BookingsModule } from '@/modules/bookings/bookings.module';
import { JobsController } from './jobs.controller';
import { SchedulerGuard } from './scheduler.guard';

@Module({
  imports: [AvailabilitiesModule, BookingsModule],
  controllers: [JobsController],
  providers: [SchedulerGuard],
})
export class JobsModule {}
