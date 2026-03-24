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
import { AuthGuard, AuthenticatedUser } from '../common/guards/auth.guard';
import { AIService } from './ai.service';
import type { UploadedFile as AIUploadedFile } from './ai.service';
import { ProcessStatementDto } from './dto/process-statement.dto';
import { Request } from 'express';

@Controller('ai')
@UseGuards(AuthGuard)
export class AIController {
  constructor(private readonly aiService: AIService) {}

  @Post('process-statement')
  @UseInterceptors(FileInterceptor('file'))
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
