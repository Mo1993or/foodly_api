
import {
  BadRequestException,
  Controller,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MediaService } from './media.service';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

const ALLOWED_FOLDERS = [
  'restaurants',
  'products',
  'users',
] as const;

type MediaFolder = (typeof ALLOWED_FOLDERS)[number];

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1,
      },
      fileFilter: (_request, file, callback) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          return callback(
            new BadRequestException(
              'Formats autorisés : JPEG, PNG et WebP.',
            ),
            false,
          );
        }

        callback(null, true);
      },
    }),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder: string,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Une image est obligatoire dans le champ "file".',
      );
    }

    if (
      !ALLOWED_FOLDERS.includes(folder as MediaFolder)
    ) {
      throw new BadRequestException(
        'Dossier invalide. Valeurs : restaurants, products, users.',
      );
    }

    return {
      message: 'Image téléversée avec succès.',
      data: await this.mediaService.uploadImage(
        file,
        folder as MediaFolder,
      ),
    };
  }
}
