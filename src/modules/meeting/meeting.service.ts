import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const WHEREBY_MEETINGS_URL = 'https://api.whereby.dev/v1/meetings';
const ROOM_TTL_AFTER_LESSON_MS = 2 * 60 * 60 * 1000;

export interface MeetingRoom {
  meetingId: string;
  roomUrl: string;
  hostRoomUrl?: string;
  startDate: string;
  endDate: string;
}

@Injectable()
export class MeetingService {
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.getOrThrow<string>('WHEREBY_API_KEY');
  }

  async createRoom(lessonEndAt: Date): Promise<MeetingRoom> {
    const endDate = new Date(lessonEndAt.getTime() + ROOM_TTL_AFTER_LESSON_MS);

    const response = await fetch(WHEREBY_MEETINGS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endDate: endDate.toISOString(),
        fields: ['hostRoomUrl'],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Whereby createRoom failed with status ${response.status}`,
      );
    }

    return (await response.json()) as MeetingRoom;
  }
}
