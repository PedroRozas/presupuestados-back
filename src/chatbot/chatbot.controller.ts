import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, AuthenticatedUser } from '../common/guards/auth.guard.js';
import { ChatbotService } from './chatbot.service.js';
import { ChatDto } from './dto/chat.dto.js';
import { RateLimit } from '../security/decorators/rate-limit.decorator.js';

@Controller('chatbot')
@UseGuards(AuthGuard)
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('chat')
  @RateLimit('chatbot')
  async chat(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() chatDto: ChatDto,
  ) {
    return this.chatbotService.chat(req.user.id, chatDto);
  }
}
