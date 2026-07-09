import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  UseGuards,
  Body,
  Query,
} from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TeacherProfileDto } from './dto/teacher-profile.dto';
import { SearchTeachersQueryDto } from './dto/search-teachers-query.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Post('profile')
  @UseGuards(JwtAuthGuard)
  createTeacherProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: TeacherProfileDto,
  ) {
    return this.teachersService.createTeacherProfile(user.userId, dto);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  updateTeacherProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: TeacherProfileDto,
  ) {
    return this.teachersService.updateTeacherProfile(user.userId, dto);
  }

  @Get()
  searchTeachers(@Query() qeury: SearchTeachersQueryDto) {
    return this.teachersService.searchTeachers(qeury);
  }

  @Get('languages')
  getAvailableLanguages() {
    return this.teachersService.getAvailableLanguages();
  }

  @Get('specialties')
  getAvailableSpecialties() {
    return this.teachersService.getAvailableSpecialties();
  }

  @Get(':id')
  findTeacherById(@Param('id') id: string) {
    return this.teachersService.findTeacherById(id);
  }

  @Get(':teacherId/availabilities')
  getTeacherAvailabilities(@Param('teacherId') teacherId: string) {
    return this.teachersService.getTeacherAvailabilities(teacherId);
  }
}
