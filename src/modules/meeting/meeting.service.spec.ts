import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MeetingService } from './meeting.service';

describe('MeetingService', () => {
  let service: MeetingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeetingService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: () => 'whereby_test_key',
          },
        },
      ],
    }).compile();

    service = module.get<MeetingService>(MeetingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
