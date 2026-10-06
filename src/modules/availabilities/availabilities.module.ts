import { Module } from '@nestjs/common';
import { AvailabilitiesController } from './availabilities.controller';
import { AvailabilitiesService } from './availabilities.service';
import { AvailabilitySlotsService } from './availability-slots.service';

@Module({
  controllers: [AvailabilitiesController],
  providers: [AvailabilitiesService, AvailabilitySlotsService],
  exports: [AvailabilitySlotsService],
})
export class AvailabilitiesModule {}
