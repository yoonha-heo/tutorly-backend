import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { fromZonedTime } from 'date-fns-tz';

import {
  SLOT_END_HOUR,
  SLOT_INTERVAL_MINUTES,
  SLOT_LOOKAHEAD_DAYS,
  SLOT_START_HOUR,
} from '@/common/constants/availability.constants';
import { PrismaService } from '@/database/prisma/prisma.service';

@Injectable()
export class AvailabilityCronService {
  private readonly logger = new Logger(AvailabilityCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 1 * * *')
  async generateDailyAvailabilitySlots() {
    const teachers = await this.prisma.teacherProfile.findMany({
      select: {
        id: true,
        timezone: true,
      },
    });

    const targetDates = this.getTargetDates();

    const slots = teachers.flatMap((teacher) =>
      targetDates.flatMap((date) =>
        this.generateSlotsForTeacher(teacher.id, teacher.timezone, date),
      ),
    );

    if (slots.length === 0) {
      return;
    }

    const result = await this.prisma.availability.createMany({
      data: slots,
      skipDuplicates: true,
    });

    this.logger.log(
      `Requested ${slots.length} slots, inserted ${result.count} slots.`,
    );
  }

  private getTargetDates(): Date[] {
    const dates: Date[] = [];

    for (let offset = 0; offset < SLOT_LOOKAHEAD_DAYS; offset += 1) {
      const date = new Date();

      date.setDate(date.getDate() + offset);
      date.setHours(0, 0, 0, 0);

      dates.push(date);
    }

    return dates;
  }

  private generateSlotsForTeacher(
    teacherId: string,
    timezone: string,
    date: Date,
  ) {
    const slots: {
      teacherId: string;
      startAt: Date;
      endAt: Date;
      isOpen: boolean;
    }[] = [];

    for (
      let minutes = SLOT_START_HOUR * 60;
      minutes < SLOT_END_HOUR * 60;
      minutes += SLOT_INTERVAL_MINUTES
    ) {
      const startLocal = this.formatLocalDateTime(date, minutes);
      const endLocal = this.formatLocalDateTime(
        date,
        minutes + SLOT_INTERVAL_MINUTES,
      );

      slots.push({
        teacherId,
        startAt: fromZonedTime(startLocal, timezone),
        endAt: fromZonedTime(endLocal, timezone),
        isOpen: false,
      });
    }

    return slots;
  }

  private formatLocalDateTime(date: Date, minutes: number): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;

    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');

    return `${year}-${month}-${day} ${hh}:${mm}:00`;
  }
}
