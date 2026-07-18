import { Purchase } from '../../models/buy-model';
import { generateMockId } from '../core/mock-id';
import { Timestamp } from '@angular/fire/firestore';
import { PRODUCTS_SEED } from './products.seed';

function createTimestamp(daysAgo: number): Timestamp {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(9, 0, 0, 0);
  return Timestamp.fromDate(date);
}

export const PURCHASES_SEED: Purchase[] = [
  {
    id: generateMockId('purch'),
    date: createTimestamp(45),
    idProduct: PRODUCTS_SEED[0].id!,
    unityValue: 3.50,
    amount: 20
  },
  {
    id: generateMockId('purch'),
    date: createTimestamp(35),
    idProduct: PRODUCTS_SEED[3].id!,
    unityValue: 1.20,
    amount: 50
  },
  {
    id: generateMockId('purch'),
    date: createTimestamp(28),
    idProduct: PRODUCTS_SEED[6].id!,
    unityValue: 1.00,
    amount: 100
  },
  {
    id: generateMockId('purch'),
    date: createTimestamp(20),
    idProduct: PRODUCTS_SEED[7].id!,
    unityValue: 6.00,
    amount: 10
  },
  {
    id: generateMockId('purch'),
    date: createTimestamp(14),
    idProduct: PRODUCTS_SEED[2].id!,
    unityValue: 8.00,
    amount: 15
  },
  {
    id: generateMockId('purch'),
    date: createTimestamp(7),
    idProduct: PRODUCTS_SEED[11].id!,
    unityValue: 2.80,
    amount: 30
  }
];
