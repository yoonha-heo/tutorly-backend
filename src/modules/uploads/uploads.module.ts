import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { GoogleCloudStorageProvider } from './providers/google-cloud-storage.provider';
import { STORAGE_PROVIDER } from './providers/storage-provider.token';

@Module({
  providers: [
    UploadsService,
    {
      provide: STORAGE_PROVIDER,
      useClass: GoogleCloudStorageProvider,
    },
  ],
  controllers: [UploadsController],
})
export class UploadsModule {}
