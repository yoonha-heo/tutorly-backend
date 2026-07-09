import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AvailabilitiesService } from './availabilities.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import type { UpdateAvailabilityDto } from './dto/update-availability.dto.ts';

@Controller('availabilities')
@UseGuards(JwtAuthGuard)
export class AvailabilitiesController {
  constructor(private readonly availabilitiesService: AvailabilitiesService) {}

  @Get('me')
  getMyAvailabilities(@CurrentUser() user: JwtPayload) {
    return this.availabilitiesService.getMyAvailabilities(user.userId);
  }

  @Patch(':id')
  updateAvailability(
    @CurrentUser() user: JwtPayload,
    @Param('id') availabilityId: string,
    @Body() dto: UpdateAvailabilityDto,
  ) {
    return this.availabilitiesService.updateAvailabilityStatus(
      user.userId,
      availabilityId,
      dto,
    );
  }
}
