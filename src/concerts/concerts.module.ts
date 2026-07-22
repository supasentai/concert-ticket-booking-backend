import { Module } from '@nestjs/common';
import { ConcertsPublicController } from './concerts-public.controller';
import { ConcertsController } from './concerts.controller';
import { ConcertsService } from './concerts.service';

@Module({
  controllers: [ConcertsController, ConcertsPublicController],
  providers: [ConcertsService],
  exports: [ConcertsService],
})
export class ConcertsModule {}
