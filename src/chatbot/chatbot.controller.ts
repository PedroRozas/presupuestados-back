import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ChatbotService } from './chatbot.service.js';
import { ChatDto } from './dto/chat.dto.js';
import { AuthGuard } from '../common/guards/auth.guard.js';

@Controller('chatbot')
@UseGuards(AuthGuard)
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('chat')
  async chat(@Req() req: { user: { sub: string } }, @Body() chatDto: ChatDto) {
    const userId = req.user.sub;
    return this.chatbotService.chat(userId, chatDto);
  }
}
