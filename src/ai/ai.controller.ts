import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard, AuthenticatedUser } from '../common/guards/auth.guard.js';
import { AIService } from './ai.service.js';
import type { UploadedFile as AIUploadedFile } from './ai.service.js';
import { ProcessStatementDto } from './dto/process-statement.dto.js';
import { Request } from 'express';
import { RateLimit } from '../security/decorators/rate-limit.decorator.js';

@Controller('ai')
@UseGuards(AuthGuard)
export class AIController {
  constructor(private readonly aiService: AIService) {}

  @Post('process-statement')
  @RateLimit('ai')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
      fileFilter: (
        _req: Request,
        file: Express.Multer.File,
        cb: (error: Error | null, acceptFile: boolean) => void,
      ) => {
        const allowedMimeTypes = [
          'application/pdf',
          'image/png',
          'image/jpeg',
          'image/webp',
        ];
        if (allowedMimeTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Tipo de archivo no permitido. Solo se aceptan PDF, PNG, JPEG y WEBP',
            ),
            false,
          );
        }
      },
    }),
  )
  processStatement(
    @UploadedFile() file: AIUploadedFile,
    @Body() processStatementDto: ProcessStatementDto,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    if (!file) {
      throw new BadRequestException('Archivo no proporcionado');
    }

    const { id: userId } = req.user;

    return this.aiService.processStatement(userId, file, processStatementDto);
  }
}
