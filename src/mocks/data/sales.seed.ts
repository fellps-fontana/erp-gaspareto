import { Sale, PaymentMethod } from '../../models/sell-model';
import { generateMockId } from '../core/mock-id';
import { Timestamp } from '@angular/fire/firestore';
import { PRODUCTS_SEED } from './products.seed';
import { CUSTOMERS_SEED } from './customers.seed';

function createTimestamp(daysAgo: number): Timestamp {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), 0, 0);
  return Timestamp.fromDate(date);
}

export const SALES_SEED: Sale[] = [
  {
    id: generateMockId('sale'),
    items: [
      {
        idProduct: PRODUCTS_SEED[0].id!,
        productName: PRODUCTS_SEED[0].title,
        quantity: 2,
        priceAtSale: 7.90,
        priceAtCost: 3.50
      }
    ],
    total: 15.80,
    date: createTimestamp(2),
    sale_type: 'pdv',
    paymentMethod: PaymentMethod.DINHEIRO,
    status: 'completed'
  } as any,
  {
    id: generateMockId('sale'),
    items: [
      {
        idProduct: PRODUCTS_SEED[1].id!,
        productName: PRODUCTS_SEED[1].title,
        quantity: 1,
        priceAtSale: 5.50,
        priceAtCost: 2.00
      }
    ],
    total: 5.50,
    date: createTimestamp(3),
    sale_type: 'pdv',
    paymentMethod: PaymentMethod.PIX,
    status: 'completed'
  } as any,
  {
    id: generateMockId('sale'),
    items: [
      {
        idProduct: PRODUCTS_SEED[2].id!,
        productName: PRODUCTS_SEED[2].title,
        quantity: 3,
        priceAtSale: 16.90,
        priceAtCost: 8.00
      }
    ],
    total: 50.70,
    date: createTimestamp(5),
    sale_type: 'order',
    paymentMethod: PaymentMethod.DINHEIRO,
    customerId: CUSTOMERS_SEED[0].id,
    status: 'completed'
  } as any,
  {
    id: generateMockId('sale'),
    items: [
      {
        idProduct: PRODUCTS_SEED[3].id!,
        productName: PRODUCTS_SEED[3].title,
        quantity: 5,
        priceAtSale: 3.90,
        priceAtCost: 1.20
      }
    ],
    total: 19.50,
    date: createTimestamp(8),
    sale_type: 'pdv',
    paymentMethod: PaymentMethod.PIX,
    status: 'completed'
  } as any,
  {
    id: generateMockId('sale'),
    items: [
      {
        idProduct: PRODUCTS_SEED[5].id!,
        productName: PRODUCTS_SEED[5].title,
        quantity: 2,
        priceAtSale: 6.90,
        priceAtCost: 2.50
      }
    ],
    total: 13.80,
    date: createTimestamp(10),
    sale_type: 'pdv',
    paymentMethod: PaymentMethod.DINHEIRO,
    status: 'canceled'
  } as any,
  {
    id: generateMockId('sale'),
    items: [
      {
        idProduct: PRODUCTS_SEED[6].id!,
        productName: PRODUCTS_SEED[6].title,
        quantity: 10,
        priceAtSale: 3.50,
        priceAtCost: 1.00
      }
    ],
    total: 35.00,
    date: createTimestamp(12),
    sale_type: 'pdv',
    paymentMethod: PaymentMethod.DINHEIRO,
    status: 'completed'
  } as any,
  {
    id: generateMockId('sale'),
    items: [
      {
        idProduct: PRODUCTS_SEED[7].id!,
        productName: PRODUCTS_SEED[7].title,
        quantity: 1,
        priceAtSale: 14.90,
        priceAtCost: 6.00
      }
    ],
    total: 14.90,
    date: createTimestamp(15),
    sale_type: 'order',
    paymentMethod: PaymentMethod.PIX,
    customerId: CUSTOMERS_SEED[1].id,
    status: 'completed'
  } as any,
  {
    id: generateMockId('sale'),
    items: [
      {
        idProduct: PRODUCTS_SEED[9].id!,
        productName: PRODUCTS_SEED[9].title,
        quantity: 8,
        priceAtSale: 4.90,
        priceAtCost: 2.00
      }
    ],
    total: 39.20,
    date: createTimestamp(18),
    sale_type: 'pdv',
    paymentMethod: PaymentMethod.DINHEIRO,
    status: 'completed'
  } as any,
  {
    id: generateMockId('sale'),
    items: [
      {
        idProduct: PRODUCTS_SEED[11].id!,
        productName: PRODUCTS_SEED[11].title,
        quantity: 2,
        priceAtSale: 7.50,
        priceAtCost: 2.80
      }
    ],
    total: 15.00,
    date: createTimestamp(22),
    sale_type: 'pdv',
    paymentMethod: PaymentMethod.PIX,
    status: 'completed'
  } as any,
  {
    id: generateMockId('sale'),
    items: [
      {
        idProduct: PRODUCTS_SEED[4].id!,
        productName: PRODUCTS_SEED[4].title,
        quantity: 1,
        priceAtSale: 12.50,
        priceAtCost: 5.00
      }
    ],
    total: 12.50,
    date: createTimestamp(28),
    sale_type: 'order',
    paymentMethod: PaymentMethod.DINHEIRO,
    customerId: CUSTOMERS_SEED[2].id,
    status: 'completed'
  } as any
];
