import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { BusinessException } from '@/common/exceptions/business.exception';
import { STORAGE_PROVIDER } from './providers/storage-provider.token';
import type { StorageProvider } from './providers/storage-provider.interface';

@Injectable()
export class UploadsService {
  constructor(
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {}

  async uploadFile(file: Express.Multer.File, directory: string) {
    if (!file) {
      throw new BusinessException(
        'FILE_REQUIRED',
        'Please select a file to upload.',
        HttpStatus.BAD_REQUEST,
        { directory },
      );
    }

    return this.storageProvider.upload({
      file,
      directory,
    });
  }
}
