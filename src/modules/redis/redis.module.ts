import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_PUBLISHER = 'REDIS_PUBLISHER';

@Global()
@Module({
    providers: [
        {
            provide: REDIS_PUBLISHER,
            useFactory: () => {
                return new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
            },
        },
    ],
    exports: [REDIS_PUBLISHER],
})
export class RedisModule { }
