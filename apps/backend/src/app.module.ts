import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { AuthenticationModule } from '@nestjs/authentication';
import { AuthorizationModule } from '@nestjs/authorization';
import { PracticumModule } from './modules/practicum/practicum.module.js';
import { InstitutionalModule } from './modules/institutional/institutional.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    AuthenticationModule.forRoot({ refreshToken: false }),
    AuthorizationModule.forRoot(),
    DatabaseModule,
    IdentityModule,
    PracticumModule,
    InstitutionalModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
