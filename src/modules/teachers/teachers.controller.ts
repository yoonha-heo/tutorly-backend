import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  UseGuards,
  Req,
  Body,
  Query,
} from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TeacherProfileDto } from './dto/teacher-profile.dto';
import type { Request } from 'express';
import { SearchTeachersQueryDto } from './dto/search-teachers-query.dto';

@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Post('profile')
  @UseGuards(JwtAuthGuard)
  createTeacherProfile(@Req() req: Request, @Body() dto: TeacherProfileDto) {
    const user = req.user as { userId: string; role: string };

    return this.teachersService.createTeacherProfile(user.userId, dto);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  updateTeacherProfile(@Req() req: Request, @Body() dto: TeacherProfileDto) {
    const user = req.user as { userId: string; role: string };

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
}
