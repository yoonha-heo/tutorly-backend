import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AvailabilitiesService } from './availabilities.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { UpdateAvailabilitiesDto } from './dto/update-availabilities.dto';

@Controller('availabilities')
@UseGuards(JwtAuthGuard)
export class AvailabilitiesController {
  constructor(private readonly availabilitiesService: AvailabilitiesService) {}

  @Get('me')
  getMyAvailabilities(@CurrentUser() user: JwtPayload) {
    return this.availabilitiesService.getMyAvailabilities(user.userId);
  }

  @Patch()
  updateAvailabilities(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateAvailabilitiesDto,
  ) {
    return this.availabilitiesService.updateAvailabilities(user.userId, dto);
  }
}
