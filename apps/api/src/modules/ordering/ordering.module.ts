import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { PublicOrdersController, StaffOrdersController } from './ordering.controllers';

@Module({ controllers: [PublicOrdersController, StaffOrdersController], providers: [OrderService], exports: [OrderService] })
export class OrderingModule {}
