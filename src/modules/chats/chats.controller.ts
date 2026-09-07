import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { JwtPayload } from '@/modules/auth/types/jwt-payload.type';
import { ChatsService } from './chats.service';
import { SendChatDto } from './dto/send-chat.dto';
import { GetMessageListQueryDto } from './dto/get-message-list-query.dto';

@Controller('chats')
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  getChatList(@CurrentUser() user: JwtPayload) {
    return this.chatsService.getChatList(user.userId);
  }

  @Get(':channelId/messages')
  @UseGuards(JwtAuthGuard)
  getMessageList(
    @CurrentUser() user: JwtPayload,
    @Param('channelId') channelId: string,
    @Query() query: GetMessageListQueryDto,
  ) {
    return this.chatsService.getMessageList(user.userId, channelId, query);
  }

  @Patch(':channelId/read')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  markAsRead(
    @CurrentUser() user: JwtPayload,
    @Param('channelId') channelId: string,
  ) {
    return this.chatsService.markAsRead(user.userId, channelId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  sendChat(@CurrentUser() user: JwtPayload, @Body() dto: SendChatDto) {
    return this.chatsService.sendChat(user.userId, dto);
  }
}
