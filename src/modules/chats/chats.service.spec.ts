import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/database/prisma/prisma.service';
import { REDIS } from '@/modules/redis/redis.module';
import { ChatsService } from './chats.service';

describe('ChatsService', () => {
  let service: ChatsService;
  const tx = {
    $executeRaw: jest.fn(),
    channel: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    message: { create: jest.fn() },
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    channelMember: { updateMany: jest.fn(), findMany: jest.fn() },
    channel: { findUnique: jest.fn() },
    message: { findUnique: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const pipeline = {
    hdel: jest.fn(),
    decrby: jest.fn(),
    hincrby: jest.fn(),
    incr: jest.fn(),
    exec: jest.fn(),
  };
  const redis = {
    publish: jest.fn(),
    exists: jest.fn(),
    hget: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    pipeline: jest.fn(() => pipeline),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    pipeline.hdel.mockReturnValue(pipeline);
    pipeline.decrby.mockReturnValue(pipeline);
    pipeline.hincrby.mockReturnValue(pipeline);
    pipeline.incr.mockReturnValue(pipeline);
    pipeline.exec.mockResolvedValue([]);
    prisma.channelMember.findMany.mockResolvedValue([]);
    redis.publish.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatsService,
        { provide: PrismaService, useValue: prisma },
        { provide: REDIS, useValue: redis },
      ],
    }).compile();

    service = module.get(ChatsService);
  });

  describe('sendChat', () => {
    it('stores the message, increments unread, and publishes over the socket when the recipient exists', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'recipient-id' });
      tx.channel.findUnique.mockResolvedValue({ id: 'channel-id' });
      tx.message.create.mockResolvedValue({
        id: 'message-id',
        channelId: 'channel-id',
        senderId: 'user-id',
        content: 'Hello',
        createdAt: new Date('2026-09-25T00:00:00.000Z'),
      });

      await expect(
        service.sendChat('user-id', {
          recipientId: 'recipient-id',
          content: 'Hello',
        }),
      ).resolves.toMatchObject({ id: 'message-id' });

      expect(tx.message.create).toHaveBeenCalled();
      expect(tx.channel.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'channel-id' } }),
      );
      expect(redis.publish).toHaveBeenCalledWith(
        'SOCKET_EVENTS',
        expect.stringContaining('NEW_MESSAGE'),
      );
    });

    it('rejects with CANNOT_CHAT_WITH_SELF when sending to yourself', async () => {
      await expect(
        service.sendChat('user-id', {
          recipientId: 'user-id',
          content: 'Hello',
        }),
      ).rejects.toMatchObject({ code: 'CANNOT_CHAT_WITH_SELF' });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('rejects with RECIPIENT_NOT_FOUND when the recipient does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.sendChat('user-id', {
          recipientId: 'missing-user',
          content: 'Hello',
        }),
      ).rejects.toMatchObject({ code: 'RECIPIENT_NOT_FOUND' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('markAsRead', () => {
    it('updates the channel member read time and decrements the Redis unread count', async () => {
      prisma.channelMember.updateMany.mockResolvedValue({ count: 1 });
      redis.exists.mockResolvedValue(1);
      redis.hget.mockResolvedValue('2');
      redis.get.mockResolvedValue('3');

      await service.markAsRead('user-id', 'channel-id');

      expect(prisma.channelMember.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { channelId: 'channel-id', userId: 'user-id' },
        }),
      );
      expect(pipeline.hdel).toHaveBeenCalledWith(
        'unread:user-id',
        'channel-id',
      );
      expect(pipeline.decrby).toHaveBeenCalledWith('unread:user-id:total', 2);
    });

    it('rejects with CHANNEL_ACCESS_DENIED when the user is not a channel member', async () => {
      prisma.channelMember.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.markAsRead('user-id', 'channel-id'),
      ).rejects.toMatchObject({ code: 'CHANNEL_ACCESS_DENIED' });
      expect(redis.exists).not.toHaveBeenCalled();
    });

    it('keeps the read update and does not throw when Redis fails', async () => {
      prisma.channelMember.updateMany.mockResolvedValue({ count: 1 });
      redis.exists.mockRejectedValue(new Error('redis down'));

      await expect(
        service.markAsRead('user-id', 'channel-id'),
      ).resolves.toBeUndefined();
      expect(prisma.channelMember.updateMany).toHaveBeenCalled();
    });
  });

  describe('getMessageList', () => {
    it('rejects with CHANNEL_ACCESS_DENIED when the user is not a channel member', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        id: 'channel-id',
        members: [],
      });

      await expect(
        service.getMessageList('user-id', 'channel-id', {}),
      ).rejects.toMatchObject({ code: 'CHANNEL_ACCESS_DENIED' });
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });

    it('rejects with INVALID_CURSOR when the cursor belongs to another channel', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        id: 'channel-id',
        members: [{ id: 'member-id' }],
      });
      prisma.message.findUnique.mockResolvedValue({
        id: 'cursor-id',
        channelId: 'other-channel',
        createdAt: new Date('2026-09-25T00:00:00.000Z'),
      });

      await expect(
        service.getMessageList('user-id', 'channel-id', {
          cursor: 'cursor-id',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });
  });
});
