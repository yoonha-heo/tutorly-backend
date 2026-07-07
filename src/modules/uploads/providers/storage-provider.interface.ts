export interface UploadResult {
  url: string;
  path: string;
  filename: string;
}

export interface StorageProvider {
  upload(params: {
    file: Express.Multer.File;
    directory: string;
  }): Promise<UploadResult>;
}
