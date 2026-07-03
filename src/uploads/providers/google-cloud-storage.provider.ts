import { Storage } from '@google-cloud/storage';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { StorageProvider, UploadResult } from './storage-provider.interface';

@Injectable()
export class GoogleCloudStorageProvider implements StorageProvider {
  private readonly storage = new Storage({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  });

  private readonly bucketName = process.env.GOOGLE_CLOUD_BUCKET_NAME!;

  async upload(params: {
    file: Express.Multer.File;
    directory: string;
  }): Promise<UploadResult> {
    const { file, directory } = params;

    const extension = file.originalname.split('.').pop();
    const filename = `${randomUUID()}.${extension}`;
    const path = `${directory}/${filename}`;

    const bucket = this.storage.bucket(this.bucketName);
    const blob = bucket.file(path);

    await blob.save(file.buffer, {
      contentType: file.mimetype,
      resumable: false,
    });

    return {
      url: `https://storage.googleapis.com/${this.bucketName}/${path}`,
      path,
      filename,
    };
  }
}
