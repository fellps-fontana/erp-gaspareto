import { Comanda } from '../../models/comanda-model';
import { generateMockId } from '../core/mock-id';
import { Timestamp } from '@angular/fire/firestore';
import { PRODUCTS_SEED } from './products.seed';

function createTimestamp(minutesAgo: number): Timestamp {
  const date = new Date();
  date.setMinutes(date.getMinutes() - minutesAgo);
  return Timestamp.fromDate(date);
}

export const COMANDAS_SEED: Comanda[] = [
  {
    id: generateMockId('cmd'),
    customerName: 'Mesa 01',
    items: [
      {
        idProduct: PRODUCTS_SEED[0].id!,
        productName: PRODUCTS_SEED[0].title,
        quantity: 2,
        priceAtSale: 7.90,
        priceAtCost: 3.50
      },
      {
        idProduct: PRODUCTS_SEED[1].id!,
        productName: PRODUCTS_SEED[1].title,
        quantity: 1,
        priceAtSale: 5.50,
        priceAtCost: 2.00
      }
    ],
    total: 20.30,
    createdAt: createTimestamp(30),
    status: 'open'
  },
  {
    id: generateMockId('cmd'),
    customerName: 'Mesa 02',
    items: [
      {
        idProduct: PRODUCTS_SEED[6].id!,
        productName: PRODUCTS_SEED[6].title,
        quantity: 3,
        priceAtSale: 3.50,
        priceAtCost: 1.00
      }
    ],
    total: 10.50,
    createdAt: createTimestamp(20),
    status: 'open'
  },
  {
    id: generateMockId('cmd'),
    customerName: 'Mesa 03',
    items: [
      {
        idProduct: PRODUCTS_SEED[7].id!,
        productName: PRODUCTS_SEED[7].title,
        quantity: 1,
        priceAtSale: 14.90,
        priceAtCost: 6.00
      },
      {
        idProduct: PRODUCTS_SEED[3].id!,
        productName: PRODUCTS_SEED[3].title,
        quantity: 2,
        priceAtSale: 3.90,
        priceAtCost: 1.20
      }
    ],
    total: 22.70,
    createdAt: createTimestamp(15),
    status: 'open'
  },
  {
    id: generateMockId('cmd'),
    customerName: 'Balcao',
    items: [
      {
        idProduct: PRODUCTS_SEED[9].id!,
        productName: PRODUCTS_SEED[9].title,
        quantity: 4,
        priceAtSale: 4.90,
        priceAtCost: 2.00
      }
    ],
    total: 19.60,
    createdAt: createTimestamp(5),
    status: 'open'
  },
  {
    id: generateMockId('cmd'),
    customerName: 'Mesa 04 - Fechada',
    items: [
      {
        idProduct: PRODUCTS_SEED[2].id!,
        productName: PRODUCTS_SEED[2].title,
        quantity: 2,
        priceAtSale: 16.90,
        priceAtCost: 8.00
      }
    ],
    total: 33.80,
    createdAt: createTimestamp(120),
    status: 'closed'
  },
  {
    id: generateMockId('cmd'),
    customerName: 'Mesa 05 - Fechada',
    items: [
      {
        idProduct: PRODUCTS_SEED[5].id!,
        productName: PRODUCTS_SEED[5].title,
        quantity: 1,
        priceAtSale: 6.90,
        priceAtCost: 2.50
      }
    ],
    total: 6.90,
    createdAt: createTimestamp(90),
    status: 'closed'
  }
];
