import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { RoleDelegationPolicy } from './domain/role-delegation.policy.js';

@Module({
  imports: [DatabaseModule],
  providers: [RoleDelegationPolicy],
})
export class IdentityModule {}
