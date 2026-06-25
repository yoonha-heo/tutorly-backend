import { Controller, Param, Body, Patch } from '@nestjs/common';
import { AdminService } from './admin.service';
import { UpdateTeacherStatusDto } from './dto/update-teacher-status.dto';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminservice: AdminService) {}

  @Patch('teachers/:id/status')
  approveTeacher(@Param('id') id: string, @Body() dto: UpdateTeacherStatusDto) {
    return this.adminservice.approveTeacher(id, dto);
  }
}
