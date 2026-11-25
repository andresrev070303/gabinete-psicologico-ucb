import { Module } from '@nestjs/common';
import {ConfigModule} from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';

@Module({
  imports: [ConfigModule.forRoot({
    isGlobal: true,
    cache: true,
  }), DatabaseModule, IdentityModule 
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
