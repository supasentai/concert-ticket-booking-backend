import { Module } from '@nestjs/common';
import { TicketCategoriesController } from './ticket-categories.controller';
import { TicketCategoriesService } from './ticket-categories.service';

@Module({
  controllers: [TicketCategoriesController],
  providers: [TicketCategoriesService],
  exports: [TicketCategoriesService],
})
export class TicketCategoriesModule {}
