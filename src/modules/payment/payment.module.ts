import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PrismaModule } from 'src/database/prisma/prisma.module';
import { MeetingModule } from '@/modules/meeting/meeting.module';
import { ChatsModule } from '@/modules/chats/chats.module';

@Module({
  imports: [PrismaModule, MeetingModule, ChatsModule],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService]
})
export class PaymentModule { }
