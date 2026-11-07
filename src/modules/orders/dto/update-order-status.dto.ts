import { IsEnum } from 'class-validator';
import { OrderStatus } from '../schemas/order.schema';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus, {
    message: 'Statut de commande invalide.',
  })
  status: OrderStatus;
}