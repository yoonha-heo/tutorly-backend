import { Module } from '@nestjs/common';
import { AvailabilitiesController } from './availabilities.controller';
import { AvailabilitiesService } from './availabilities.service';
import { AvailabilityCronService } from './availability-cron.service';

@Module({
  controllers: [AvailabilitiesController],
  providers: [AvailabilitiesService, AvailabilityCronService],
})
export class AvailabilitiesModule {}
