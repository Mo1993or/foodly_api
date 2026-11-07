
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrderDocument = HydratedDocument<Order>;

export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  PREPARING = 'PREPARING',
  READY = 'READY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentMethod {
  CASH_ON_DELIVERY = 'CASH_ON_DELIVERY',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
}

@Schema({ _id: false })
export class OrderCustomer {
  @Prop({ required: true, trim: true, maxlength: 100 })
  name: string;

  @Prop({ required: true, trim: true, maxlength: 30 })
  phone: string;

  @Prop({ required: true, trim: true, maxlength: 250 })
  address: string;
}

export const OrderCustomerSchema =
  SchemaFactory.createForClass(OrderCustomer);

@Schema({ _id: false })
export class OrderItem {
  @Prop({
    type: Types.ObjectId,
    ref: 'Product',
    required: true,
  })
  productId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ default: '' })
  imageUrl: string;
}

export const OrderItemSchema =
  SchemaFactory.createForClass(OrderItem);

@Schema({
  timestamps: true,
  versionKey: false,
})
export class Order {
  @Prop({
    type: Types.ObjectId,
    ref: 'Restaurant',
    required: true,
    index: true,
  })
  restaurantId: Types.ObjectId;

  @Prop({
    type: OrderCustomerSchema,
    required: true,
  })
  customer: OrderCustomer;

  @Prop({
    type: [OrderItemSchema],
    required: true,
    validate: {
      validator: (items: OrderItem[]) =>
        Array.isArray(items) && items.length > 0,
      message: 'Une commande doit contenir au moins un produit.',
    },
  })
  items: OrderItem[];

  @Prop({ required: true, min: 0 })
  total: number;

  @Prop({
    required: true,
    enum: PaymentMethod,
    default: PaymentMethod.CASH_ON_DELIVERY,
  })
  paymentMethod: PaymentMethod;

  @Prop({
    required: true,
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  paymentStatus: PaymentStatus;

  @Prop({
    required: true,
    enum: OrderStatus,
    default: OrderStatus.PENDING,
    index: true,
  })
  status: OrderStatus;

  @Prop({ trim: true, maxlength: 500, default: '' })
  note: string;

}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ restaurantId: 1, createdAt: -1 });
