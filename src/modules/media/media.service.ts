
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

export interface UploadedImage {
  url: string;
  publicId: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(private readonly configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.getOrThrow<string>(
        'CLOUDINARY_CLOUD_NAME',
      ),
      api_key: this.configService.getOrThrow<string>(
        'CLOUDINARY_API_KEY',
      ),
      api_secret: this.configService.getOrThrow<string>(
        'CLOUDINARY_API_SECRET',
      ),
      secure: true,
    });
  }

  async uploadImage(
    file: Express.Multer.File,
    folder: string,
  ): Promise<UploadedImage> {
    try {
      const result = await new Promise<UploadApiResponse>(
        (resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: `foodly/${folder}`,
              resource_type: 'image',
              allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
              transformation: [
                {
                  width: 1600,
                  height: 1600,
                  crop: 'limit',
                },
                {
                  quality: 'auto',
                  fetch_format: 'auto',
                },
              ],
            },
            (error, response) => {
              if (error) {
                reject(error);
                return;
              }

              if (!response) {
                reject(new Error('Cloudinary n’a retourné aucun résultat.'));
                return;
              }

              resolve(response);
            },
          );

          stream.end(file.buffer);
        },
      );

      return {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
      };
    } catch (error) {
      this.logger.error(
        'Échec de l’upload Cloudinary',
        error instanceof Error ? error.message : undefined,
      );

      throw new InternalServerErrorException(
        'Impossible de téléverser cette image.',
      );
    }
  }

  async deleteImage(publicId: string): Promise<void> {
    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: 'image',
        invalidate: true,
      });

      if (result.result !== 'ok' && result.result !== 'not found') {
        throw new Error('La suppression Cloudinary a échoué.');
      }
    } catch (error) {
      this.logger.error(
        'Échec de la suppression Cloudinary',
        error instanceof Error ? error.message : undefined,
      );

      throw new InternalServerErrorException(
        'Impossible de supprimer cette image.',
      );
    }
  }
}
