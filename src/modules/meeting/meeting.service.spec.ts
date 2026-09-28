import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MeetingService } from './meeting.service';

describe('MeetingService', () => {
  let service: MeetingService;
  const fetchMock = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    global.fetch = fetchMock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeetingService,
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => 'whereby_test_key' },
        },
      ],
    }).compile();

    service = module.get(MeetingService);
  });

  describe('createRoom', () => {
    it('creates a Whereby room that stays valid until two hours after the lesson ends', async () => {
      const lessonEndAt = new Date('2026-09-26T01:50:00.000Z');
      fetchMock.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            meetingId: 'meeting-id',
            roomUrl: 'https://whereby.test/room',
          }),
      });

      await expect(service.createRoom(lessonEndAt)).resolves.toEqual({
        meetingId: 'meeting-id',
        roomUrl: 'https://whereby.test/room',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.whereby.dev/v1/meetings',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            endDate: '2026-09-26T03:50:00.000Z',
            fields: ['hostRoomUrl'],
          }),
        }),
      );
    });

    it('throws and does not read the body when the Whereby response fails', async () => {
      const json = jest.fn();
      fetchMock.mockResolvedValue({ ok: false, status: 502, json });

      await expect(
        service.createRoom(new Date('2026-09-26T01:50:00.000Z')),
      ).rejects.toThrow('Whereby createRoom failed with status 502');
      expect(json).not.toHaveBeenCalled();
    });
  });
});
