import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/auth/guards/roles.guard';
import { Roles } from '@/modules/auth/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { ListTeacherProfilesQueryDto } from './dto/list-teacher-profiles-query.dto';
import { RejectTeacherDto } from './dto/reject-teacher.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('teachers')
  listTeacherProfiles(@Query() query: ListTeacherProfilesQueryDto) {
    return this.adminService.listTeacherProfiles(query);
  }

  @Get('teachers/:id')
  getTeacherProfile(@Param('id') id: string) {
    return this.adminService.getTeacherProfile(id);
  }

  @Patch('teachers/:id/approve')
  approveTeacher(@Param('id') id: string) {
    return this.adminService.approveTeacher(id);
  }

  @Patch('teachers/:id/reject')
  rejectTeacher(@Param('id') id: string, @Body() dto: RejectTeacherDto) {
    return this.adminService.rejectTeacher(id, dto);
  }
}
