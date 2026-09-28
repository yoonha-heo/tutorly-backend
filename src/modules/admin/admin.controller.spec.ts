import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

describe('AdminController', () => {
  let controller: AdminController;
  const adminService = {
    listTeacherProfiles: jest.fn(),
    getTeacherProfile: jest.fn(),
    approveTeacher: jest.fn(),
    rejectTeacher: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: adminService }],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('lists teacher profiles', async () => {
    const query = { status: undefined, page: 1, limit: 20 };

    await controller.listTeacherProfiles(query);

    expect(adminService.listTeacherProfiles).toHaveBeenCalledWith(query);
  });

  it('gets a teacher profile', async () => {
    await controller.getTeacherProfile('teacher-id');

    expect(adminService.getTeacherProfile).toHaveBeenCalledWith('teacher-id');
  });

  it('approves a teacher profile', async () => {
    await controller.approveTeacher('teacher-id');

    expect(adminService.approveTeacher).toHaveBeenCalledWith('teacher-id');
  });

  it('rejects a teacher profile with a reason', async () => {
    const dto = { rejectionReason: 'Incomplete bio.' };

    await controller.rejectTeacher('teacher-id', dto);

    expect(adminService.rejectTeacher).toHaveBeenCalledWith('teacher-id', dto);
  });
});
