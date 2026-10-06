import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './database/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { TeachersModule } from './modules/teachers/teachers.module';
import { AdminModule } from './modules/admin/admin.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { AvailabilitiesModule } from './modules/availabilities/availabilities.module';
import { PaymentModule } from './modules/payment/payment.module';
import { MeetingModule } from './modules/meeting/meeting.module';
import { ReviewModule } from './modules/review/review.module';
import { RedisModule } from './modules/redis/redis.module';
import { ChatsModule } from './modules/chats/chats.module';
import { JobsModule } from './modules/jobs/jobs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    TeachersModule,
    AdminModule,
    UploadsModule,
    BookingsModule,
    AvailabilitiesModule,
    PaymentModule,
    MeetingModule,
    ReviewModule,
    RedisModule,
    ChatsModule,
    JobsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
