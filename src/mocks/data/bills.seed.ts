import { Bill } from '../../models/bill-model';
import { generateMockId } from '../core/mock-id';
import { Timestamp } from '@angular/fire/firestore';

function createTimestamp(daysAgo: number, hour: number = 10): Timestamp {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return Timestamp.fromDate(date);
}

function createFutureTimestamp(daysFromNow: number): Timestamp {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(10, 0, 0, 0);
  return Timestamp.fromDate(date);
}

export const BILLS_SEED: Bill[] = [
  {
    id: generateMockId('bill'),
    name: 'Aluguel Loja',
    value: 1500.00,
    dueDate: createFutureTimestamp(15),
    status: 'pendente',
    recurring: true,
    recurrencePeriod: 'mensal',
    createdAt: createTimestamp(45)
  },
  {
    id: generateMockId('bill'),
    name: 'Internet e Telefone',
    value: 250.00,
    dueDate: createFutureTimestamp(8),
    status: 'pendente',
    recurring: false,
    createdAt: createTimestamp(30)
  },
  {
    id: generateMockId('bill'),
    name: 'Fornecedor de Bebidas',
    value: 800.00,
    dueDate: createFutureTimestamp(22),
    status: 'pendente',
    recurring: true,
    recurrencePeriod: 'semanal',
    createdAt: createTimestamp(60)
  },
  {
    id: generateMockId('bill'),
    name: 'Energia Eletrica',
    value: 450.00,
    dueDate: createTimestamp(5),
    status: 'recebido',
    recurring: false,
    receivedAt: createTimestamp(3),
    createdAt: createTimestamp(35)
  },
  {
    id: generateMockId('bill'),
    name: 'Limpeza e Conservacao',
    value: 350.00,
    dueDate: createTimestamp(10),
    status: 'recebido',
    recurring: false,
    receivedAt: createTimestamp(8),
    createdAt: createTimestamp(40)
  },
  {
    id: generateMockId('bill'),
    name: 'Material de Estoque - Produto Compra',
    value: 600.00,
    dueDate: createTimestamp(2),
    status: 'recebido',
    recurring: false,
    purchaseProductId: generateMockId('pp'),
    receivedAt: createTimestamp(1),
    createdAt: createTimestamp(25)
  },
  {
    id: generateMockId('bill'),
    name: 'Funcionarios - Salario',
    value: 3000.00,
    dueDate: createTimestamp(30),
    status: 'pago',
    recurring: false,
    paidAt: createTimestamp(28),
    receivedAt: createTimestamp(30),
    createdAt: createTimestamp(50)
  },
  {
    id: generateMockId('bill'),
    name: 'Manutencao de Equipamentos',
    value: 200.00,
    dueDate: createTimestamp(20),
    status: 'pago',
    recurring: false,
    paidAt: createTimestamp(18),
    receivedAt: createTimestamp(20),
    createdAt: createTimestamp(35)
  },
  {
    id: generateMockId('bill'),
    name: 'Segurado - Loja',
    value: 500.00,
    dueDate: createTimestamp(10),
    status: 'pago',
    recurring: true,
    recurrencePeriod: 'mensal',
    paidAt: createTimestamp(8),
    receivedAt: createTimestamp(10),
    createdAt: createTimestamp(55)
  }
];
