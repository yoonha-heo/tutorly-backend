import { BadRequestException, Inject, Injectable } from '@nestjs/common';
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
      throw new BadRequestException('File is required');
    }

    return this.storageProvider.upload({
      file,
      directory,
    });
  }
}
