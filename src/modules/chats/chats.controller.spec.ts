import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';

describe('ChatsController', () => {
  let controller: ChatsController;
  const chatsService = {
    sendChat: jest.fn(),
    getChatList: jest.fn(),
    getMessageList: jest.fn(),
    markAsRead: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatsController],
      providers: [{ provide: ChatsService, useValue: chatsService }],
    }).compile();

    controller = module.get<ChatsController>(ChatsController);
  });

  it('sends a chat for the current user', async () => {
    const user = { userId: 'user-id', role: UserRole.STUDENT };
    const dto = { recipientId: 'teacher-id', content: 'Hello' };

    await controller.sendChat(user, dto);

    expect(chatsService.sendChat).toHaveBeenCalledWith('user-id', dto);
  });

  it('gets the chat list for the current user', async () => {
    const user = { userId: 'user-id', role: UserRole.STUDENT };

    await controller.getChatList(user);

    expect(chatsService.getChatList).toHaveBeenCalledWith('user-id');
  });

  it('gets the message list for a channel', async () => {
    const user = { userId: 'user-id', role: UserRole.STUDENT };
    const query = { cursor: 'message-id', limit: 20 };

    await controller.getMessageList(user, 'channel-id', query);

    expect(chatsService.getMessageList).toHaveBeenCalledWith(
      'user-id',
      'channel-id',
      query,
    );
  });

  it('marks a channel as read for the current user', async () => {
    const user = { userId: 'user-id', role: UserRole.STUDENT };

    await controller.markAsRead(user, 'channel-id');

    expect(chatsService.markAsRead).toHaveBeenCalledWith(
      'user-id',
      'channel-id',
    );
  });
});
