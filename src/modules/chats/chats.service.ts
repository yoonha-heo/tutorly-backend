import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { MessageType, Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { BusinessException } from '@/common/exceptions/business.exception';
import { PrismaService } from '@/database/prisma/prisma.service';
import { REDIS_PUBLISHER } from '@/modules/redis/redis.module';
import { SendChatDto } from './dto/send-chat.dto';
import { GetMessageListQueryDto } from './dto/get-message-list-query.dto';

const MESSAGE_SENDER_SELECT = {
  id: true,
  name: true,
  profileImage: true,
} as const;

@Injectable()
export class ChatsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_PUBLISHER) private readonly redisPublisher: Redis,
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

      return tx.message.create({
        data: {
          content: dto.content,
          channelId: channel.id,
          senderId: userId,
        },
        include: { sender: { select: MESSAGE_SENDER_SELECT } },
      });
    });

    await this.publishNewMessage(savedMessage.channelId, savedMessage);

    return savedMessage;
  }

  async notifyLessonConfirmed(params: {
    studentId: string;
    teacherUserId: string;
    bookingId: string;
    lessonStartAt: Date;
    meetingUrl: string;
  }) {
    const savedMessage = await this.prisma.$transaction(async (tx) => {
      const channel = await this.ensureDirectChannel(
        tx,
        params.studentId,
        params.teacherUserId,
        params.bookingId,
      );

      return tx.message.create({
        data: {
          channelId: channel.id,
          senderId: null,
          content: `🎉 Lesson confirmed!\n- Date & Time: ${params.lessonStartAt.toLocaleString('en-US')}`,
          type: MessageType.SYSTEM,
        } as unknown as Prisma.MessageUncheckedCreateInput,
      });
    });

    await this.publishNewMessage(savedMessage.channelId, {
      ...savedMessage,
      meetingUrl: params.meetingUrl,
    });
  }

  async getChatList(userId: string) {
    const channels = await this.prisma.channel.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: {
          select: {
            userId: true,
            lastReadAt: true,
            user: { select: MESSAGE_SENDER_SELECT },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { select: MESSAGE_SENDER_SELECT } },
        },
      },
    });

    const unreadCounts =
      channels.length === 0
        ? []
        : await this.prisma.message.groupBy({
            by: ['channelId'],
            where: {
              OR: channels.map((channel) => {
                const lastReadAt =
                  channel.members.find((member) => member.userId === userId)
                    ?.lastReadAt ?? new Date(0);

                return {
                  channelId: channel.id,
                  createdAt: { gt: lastReadAt },
                  NOT: { senderId: userId },
                };
              }),
            },
            _count: { _all: true },
          });

    const unreadByChannelId = new Map(
      unreadCounts.map((row) => [row.channelId, row._count._all]),
    );

    const items = channels
      .map((channel) => ({
        id: channel.id,
        otherUser:
          channel.members.find((member) => member.userId !== userId)?.user ??
          null,
        lastMessage: channel.messages[0] ?? null,
        unreadCount: unreadByChannelId.get(channel.id) ?? 0,
      }))
      .sort((a, b) => {
        const aTime = a.lastMessage?.createdAt.getTime() ?? 0;
        const bTime = b.lastMessage?.createdAt.getTime() ?? 0;
        return bTime - aTime;
      });

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

    const limit = query.limit ?? 20;
    let cursorFilter: Prisma.MessageWhereInput = {};

    if (query.cursor) {
      const cursorMessage = await this.prisma.message.findUnique({
        where: { id: query.cursor },
        select: { id: true, channelId: true, createdAt: true },
      });

      if (!cursorMessage || cursorMessage.channelId !== channelId) {
        throw new BusinessException(
          'INVALID_CURSOR',
          'The pagination cursor is invalid.',
          HttpStatus.BAD_REQUEST,
        );
      }

      cursorFilter = {
        OR: [
          { createdAt: { lt: cursorMessage.createdAt } },
          {
            createdAt: cursorMessage.createdAt,
            id: { lt: cursorMessage.id },
          },
        ],
      };
    }

    const messages = await this.prisma.message.findMany({
      where: { channelId, ...cursorFilter },
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

  private async ensureDirectChannel(
    tx: Prisma.TransactionClient,
    userId: string,
    otherUserId: string,
    bookingId?: string,
  ) {
    const channel = await tx.channel.findFirst({
      where: {
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: otherUserId } } },
        ],
      },
    });

    if (!channel) {
      return tx.channel.create({
        data: {
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

  private async publishNewMessage(channelId: string, message: unknown) {
    await this.redisPublisher.publish(
      'SOCKET_EVENTS',
      JSON.stringify({
        event: 'NEW_MESSAGE',
        data: { channelId, message },
      }),
    );
  }
}
