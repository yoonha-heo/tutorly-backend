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

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('lists teacher profiles', () => {
    const query = { status: undefined, page: 1, limit: 20 };

    controller.listTeacherProfiles(query);

    expect(adminService.listTeacherProfiles).toHaveBeenCalledWith(query);
  });

  it('gets a teacher profile', () => {
    controller.getTeacherProfile('teacher-id');

    expect(adminService.getTeacherProfile).toHaveBeenCalledWith('teacher-id');
  });

  it('approves a teacher profile', () => {
    controller.approveTeacher('teacher-id');

    expect(adminService.approveTeacher).toHaveBeenCalledWith('teacher-id');
  });

  it('rejects a teacher profile with a reason', () => {
    const dto = { rejectionReason: 'Incomplete bio.' };

    controller.rejectTeacher('teacher-id', dto);

    expect(adminService.rejectTeacher).toHaveBeenCalledWith('teacher-id', dto);
  });
});
