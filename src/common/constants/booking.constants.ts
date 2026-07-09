import { LessonType } from '@prisma/client';

export const SLOT_INTERVAL_MINUTES = 30;

export const LESSON_DURATION_BY_TYPE: Record<LessonType, number> = {
  TRIAL: 25,
  STANDARD: 50,
};

export const PAYMENT_EXPIRES_IN_MINUTES = 15;
