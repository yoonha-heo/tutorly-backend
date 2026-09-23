import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { MessageType, Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { BusinessException } from '@/common/exceptions/business.exception';
import { PrismaService } from '@/database/prisma/prisma.service';
import { REDIS } from '@/modules/redis/redis.module';
import { SendChatDto } from './dto/send-chat.dto';
import { GetMessageListQueryDto } from './dto/get-message-list-query.dto';

const MESSAGE_SENDER_SELECT = {
  id: true,
  name: true,
  profileImage: true,
} as const;

type MessageSender = {
  id: string;
  name: string | null;
  profileImage: string | null;
};

type PublishedMessage = {
  id: string;
  channelId: string;
  senderId: string | null;
  content: string;
  type: MessageType;
  createdAt: Date;
  sender?: MessageSender | null;
  meetingUrl?: string;
};

type CursorMessage = {
  id: string;
  createdAt: Date;
};

type UnreadCountRow = {
  channelId: string;
  count: number;
};

function unreadHashKey(userId: string) {
  return `unread:${userId}`;
}

function unreadTotalKey(userId: string) {
  return `unread:${userId}:total`;
}

function unreadWarmedKey(userId: string) {
  return `unread:${userId}:warmed`;
}

@Injectable()
export class ChatsService {
  private readonly logger = new Logger(ChatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) { }

  async sendChat(userId: string, dto: SendChatDto) {
    if (dto.recipientId === userId) {
      throw new BusinessException(
        'CANNOT_CHAT_WITH_SELF',
        'You cannot send a message to yourself.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const recipient = await this.prisma.user.findUnique({
      where: { id: dto.recipientId },
      select: { id: true },
    });

    if (!recipient) {
      throw new BusinessException(
        'RECIPIENT_NOT_FOUND',
        'This user could not be found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const savedMessage = await this.prisma.$transaction(async (tx) => {
      const channel = await this.ensureDirectChannel(tx, userId, recipient.id);

      const message = await tx.message.create({
        data: {
          content: dto.content,
          channelId: channel.id,
          senderId: userId,
        },
        include: { sender: { select: MESSAGE_SENDER_SELECT } },
      });

      await tx.channel.update({
        where: { id: channel.id },
        data: { lastMessageAt: message.createdAt },
      });

      return message;
    });

    await this.incrementChannelUnread(
      savedMessage.channelId,
      savedMessage.senderId,
    );
    await this.publishNewMessage(savedMessage.channelId, savedMessage);

    return savedMessage;
  }

  async notifyLessonConfirmed(params: {
    studentId: string;
    teacherUserId: string;
    bookingId: string;
    lessonStartAt: Date;
  }) {
    const savedMessage = await this.prisma.$transaction(async (tx) => {
      const channel = await this.ensureDirectChannel(
        tx,
        params.studentId,
        params.teacherUserId,
        params.bookingId,
      );

      const data: Prisma.MessageUncheckedCreateInput = {
        channelId: channel.id,
        senderId: null,
        content: `🎉 Lesson confirmed!\n- Date & Time: ${params.lessonStartAt.toLocaleString('en-US')}`,
        type: MessageType.SYSTEM,
      };

      const message = await tx.message.create({ data });

      await tx.channel.update({
        where: { id: channel.id },
        data: { lastMessageAt: message.createdAt },
      });

      return message;
    });

    await this.incrementChannelUnread(
      savedMessage.channelId,
      savedMessage.senderId,
    );
    await this.publishNewMessage(savedMessage.channelId, savedMessage);
  }

  async getChatList(userId: string) {
    const channels = await this.findUserChannels(userId);

    if (channels.length === 0) {
      return { items: [] };
    }

    let unreadHash: Record<string, string> = {};
    try {
      const isWarmed = await this.redis.exists(unreadWarmedKey(userId));
      if (!isWarmed) {
        await this.warmUnreadCounts(userId);
      }

      unreadHash = await this.redis.hgetall(unreadHashKey(userId));
    } catch (error) {
      this.logger.warn(
        `Unread cache unavailable, falling back to DB: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      const unreadCounts = await this.findUnreadCounts(userId);
      unreadHash = Object.fromEntries(
        unreadCounts.map((row) => [row.channelId, String(row.count)]),
      );
    }

    const items = channels.map((channel) => ({
      id: channel.id,
      otherUser: channel.members[0]?.user ?? null,
      lastMessage: channel.messages[0] ?? null,
      unreadCount: Number(unreadHash[channel.id] ?? 0),
    }));

    return { items };
  }

  async markAsRead(userId: string, channelId: string) {
    const result = await this.prisma.channelMember.updateMany({
      where: { channelId, userId },
      data: { lastReadAt: new Date() },
    });

    if (result.count === 0) {
      throw new BusinessException(
        'CHANNEL_ACCESS_DENIED',
        'You are not a member of this chat channel.',
        HttpStatus.FORBIDDEN,
      );
    }

    try {
      const isWarmed = await this.redis.exists(unreadWarmedKey(userId));
      if (!isWarmed) {
        await this.warmUnreadCounts(userId);
        return;
      }

      const previous = Number(
        (await this.redis.hget(unreadHashKey(userId), channelId)) ?? 0,
      );
      if (previous <= 0) {
        return;
      }

      await this.redis
        .pipeline()
        .hdel(unreadHashKey(userId), channelId)
        .decrby(unreadTotalKey(userId), previous)
        .exec();

      const total = Number((await this.redis.get(unreadTotalKey(userId))) ?? 0);
      if (total < 0) {
        await this.redis.set(unreadTotalKey(userId), 0);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to update unread cache for channel ${channelId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async getMessageList(
    userId: string,
    channelId: string,
    query: GetMessageListQueryDto,
  ) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        members: {
          where: { userId },
          select: { id: true },
        },
      },
    });

    if (!channel) {
      throw new BusinessException(
        'CHANNEL_NOT_FOUND',
        'This chat channel could not be found.',
        HttpStatus.NOT_FOUND,
      );
    }

    if (channel.members.length === 0) {
      throw new BusinessException(
        'CHANNEL_ACCESS_DENIED',
        'You are not a member of this chat channel.',
        HttpStatus.FORBIDDEN,
      );
    }

    const cursorMessage = query.cursor
      ? await this.prisma.message.findUnique({
        where: { id: query.cursor },
        select: { id: true, channelId: true, createdAt: true },
      })
      : null;

    if (
      query.cursor &&
      (!cursorMessage || cursorMessage.channelId !== channelId)
    ) {
      throw new BusinessException(
        'INVALID_CURSOR',
        'The pagination cursor is invalid.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const limit = query.limit ?? 20;
    const messages = await this.prisma.message.findMany({
      where: {
        channelId,
        ...this.buildCursorFilter(cursorMessage),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { sender: { select: MESSAGE_SENDER_SELECT } },
    });

    const hasNextPage = messages.length > limit;
    const items = hasNextPage ? messages.slice(0, limit) : messages;

    return {
      items,
      nextCursor: hasNextPage ? items[items.length - 1].id : null,
      hasNextPage,
    };
  }

  private async findUserChannels(userId: string) {
    return this.prisma.channel.findMany({
      where: { members: { some: { userId } } },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        members: {
          where: { userId: { not: userId } },
          select: {
            user: { select: MESSAGE_SENDER_SELECT },
          },
        },
        messages: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          include: { sender: { select: MESSAGE_SENDER_SELECT } },
        },
      },
    });
  }

  private async incrementChannelUnread(
    channelId: string,
    senderId: string | null,
  ) {
    const members = await this.prisma.channelMember.findMany({
      where: {
        channelId,
        ...(senderId ? { userId: { not: senderId } } : {}),
      },
      select: { userId: true },
    });

    try {
      for (const member of members) {
        const isWarmed = await this.redis.exists(
          unreadWarmedKey(member.userId),
        );
        if (!isWarmed) {
          await this.warmUnreadCounts(member.userId);
          continue;
        }

        await this.redis
          .pipeline()
          .hincrby(unreadHashKey(member.userId), channelId, 1)
          .incr(unreadTotalKey(member.userId))
          .exec();
      }
    } catch (error) {
      this.logger.warn(
        `Failed to increment unread for channel ${channelId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private async warmUnreadCounts(userId: string) {
    const unreadCounts = await this.findUnreadCounts(userId);
    const total = unreadCounts.reduce((sum, row) => sum + row.count, 0);

    const pipeline = this.redis.pipeline();
    pipeline.del(unreadHashKey(userId));

    for (const row of unreadCounts) {
      if (row.count > 0) {
        pipeline.hset(unreadHashKey(userId), row.channelId, row.count);
      }
    }

    pipeline.set(unreadTotalKey(userId), total);
    pipeline.set(unreadWarmedKey(userId), 1);
    await pipeline.exec();
  }

  private async findUnreadCounts(userId: string) {
    return this.prisma.$queryRaw<UnreadCountRow[]>(Prisma.sql`
      SELECT cm."channelId", COUNT(m.id)::int AS count
      FROM "ChannelMember" cm
      INNER JOIN "Message" m
        ON m."channelId" = cm."channelId"
       AND m."createdAt" > cm."lastReadAt"
       AND m."senderId" IS DISTINCT FROM ${userId}
      WHERE cm."userId" = ${userId}
      GROUP BY cm."channelId"
    `);
  }

  private buildCursorFilter(
    cursorMessage: CursorMessage | null,
  ): Prisma.MessageWhereInput {
    if (!cursorMessage) {
      return {};
    }

    return {
      OR: [
        { createdAt: { lt: cursorMessage.createdAt } },
        {
          createdAt: cursorMessage.createdAt,
          id: { lt: cursorMessage.id },
        },
      ],
    };
  }

  private async ensureDirectChannel(
    tx: Prisma.TransactionClient,
    userId: string,
    otherUserId: string,
    bookingId?: string,
  ) {
    const leftId = userId < otherUserId ? userId : otherUserId;
    const rightId = userId < otherUserId ? otherUserId : userId;
    const pairKey = `${leftId}:${rightId}`;

    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${leftId}), hashtext(${rightId}))`,
    );

    const channel = await tx.channel.findUnique({
      where: { pairKey },
    });

    if (!channel) {
      return tx.channel.create({
        data: {
          pairKey,
          bookingId,
          members: {
            create: [{ userId }, { userId: otherUserId }],
          },
        },
      });
    }

    if (!bookingId) {
      return channel;
    }

    return tx.channel.update({
      where: { id: channel.id },
      data: { bookingId },
    });
  }

  private async publishNewMessage(
    channelId: string,
    message: PublishedMessage,
  ) {
    try {
      await this.redis.publish(
        'SOCKET_EVENTS',
        JSON.stringify({
          event: 'NEW_MESSAGE',
          data: { channelId, message },
        }),
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish NEW_MESSAGE for channel ${channelId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
