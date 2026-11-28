import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { IdentityTransactions } from '../identity/infrastructure/identity-transactions.js';
import { PlacementService } from './application/placement.service.js';
import { PracticeWorkService } from './application/practice-work.service.js';
import { PostgresPracticumStore } from './infrastructure/postgres-practicum.store.js';
import { PracticumAccessPolicy } from './presentation/practicum-access.policy.js';
import { PracticumController } from './presentation/practicum.controller.js';

@Module({
  imports: [IdentityModule],
  controllers: [PracticumController],
  providers: [
    PracticumAccessPolicy,
    {
      provide: PostgresPracticumStore,
      inject: [IdentityTransactions],
      useFactory: (access: IdentityTransactions) =>
        new PostgresPracticumStore(access),
    },
    {
      provide: PlacementService,
      inject: [PostgresPracticumStore],
      useFactory: (store: PostgresPracticumStore) =>
        new PlacementService(store),
    },
    {
      provide: PracticeWorkService,
      inject: [PostgresPracticumStore],
      useFactory: (store: PostgresPracticumStore) =>
        new PracticeWorkService(store),
    },
  ],
})
export class PracticumModule {}
