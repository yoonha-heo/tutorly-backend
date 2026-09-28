import { Test, TestingModule } from '@nestjs/testing';
import { STORAGE_PROVIDER } from './providers/storage-provider.token';
import { UploadsService } from './uploads.service';

describe('UploadsService', () => {
  let service: UploadsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadsService,
        {
          provide: STORAGE_PROVIDER,
          useValue: { upload: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(UploadsService);
  });

  describe('uploadFile', () => {
    it('rejects with FILE_REQUIRED when no file is provided', async () => {
      await expect(
        service.uploadFile(
          undefined as unknown as Express.Multer.File,
          'profiles',
        ),
      ).rejects.toMatchObject({ code: 'FILE_REQUIRED' });
    });
  });
});
