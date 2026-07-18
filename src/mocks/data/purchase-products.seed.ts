import { PurchaseProduct } from '../../models/purchase-product-model';
import { generateMockId } from '../core/mock-id';
import { Timestamp } from '@angular/fire/firestore';

function createTimestamp(daysAgo: number): Timestamp {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(10, 0, 0, 0);
  return Timestamp.fromDate(date);
}

export const PURCHASE_PRODUCTS_SEED: PurchaseProduct[] = [
  {
    id: generateMockId('pp'),
    name: 'Aluguel de Equipamento de Frigorífico',
    defaultValue: 450.00,
    recurring: true,
    recurrencePeriod: 'monthly',
    createdAt: createTimestamp(90)
  },
  {
    id: generateMockId('pp'),
    name: 'Fornecimento de Gás para Chapa',
    defaultValue: 120.00,
    recurring: true,
    recurrencePeriod: 'weekly',
    createdAt: createTimestamp(60)
  },
  {
    id: generateMockId('pp'),
    name: 'Limpeza de Caixa de Gordura',
    defaultValue: 200.00,
    recurring: false,
    createdAt: createTimestamp(45)
  },
  {
    id: generateMockId('pp'),
    name: 'Manutencao de Sistema de Ventilacao',
    defaultValue: 350.00,
    recurring: true,
    recurrencePeriod: 'monthly',
    createdAt: createTimestamp(30)
  }
];
