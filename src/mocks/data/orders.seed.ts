import { Order } from '../../models/order-model';
import { generateMockId } from '../core/mock-id';
import { Timestamp } from '@angular/fire/firestore';
import { PRODUCTS_SEED } from './products.seed';
import { CUSTOMERS_SEED } from './customers.seed';

function createTimestamp(daysAgo: number): Timestamp {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(10, 30, 0, 0);
  return Timestamp.fromDate(date);
}

export const ORDERS_SEED: Order[] = [
  {
    id: generateMockId('order'),
    customerName: 'Joao Silva',
    customerPhone: '(11) 98765-4321',
    customerId: CUSTOMERS_SEED[0].id,
    items: [
      {
        idProduct: PRODUCTS_SEED[0].id!,
        productName: PRODUCTS_SEED[0].title,
        quantity: 2,
        priceAtSale: 7.90,
        priceAtCost: 3.50
      }
    ],
    itemsTotal: 15.80,
    shippingCost: 5.00,
    total: 20.80,
    deliveryType: 'delivery',
    address: 'Rua A, 123, Apartamento 201, Centro, Sao Paulo',
    addressLat: -23.5505,
    addressLng: -46.6333,
    status: 'open',
    createdAt: createTimestamp(15),
    scheduledDate: createTimestamp(13)
  },
  {
    id: generateMockId('order'),
    customerName: 'Maria Santos',
    customerPhone: '(11) 99876-5432',
    customerId: CUSTOMERS_SEED[1].id,
    items: [
      {
        idProduct: PRODUCTS_SEED[1].id!,
        productName: PRODUCTS_SEED[1].title,
        quantity: 1,
        priceAtSale: 5.50,
        priceAtCost: 2.00
      },
      {
        idProduct: PRODUCTS_SEED[2].id!,
        productName: PRODUCTS_SEED[2].title,
        quantity: 3,
        priceAtSale: 16.90,
        priceAtCost: 8.00
      }
    ],
    itemsTotal: 56.20,
    shippingCost: 10.00,
    total: 66.20,
    deliveryType: 'pickup',
    status: 'pending',
    createdAt: createTimestamp(12),
    scheduledDate: createTimestamp(10)
  },
  {
    id: generateMockId('order'),
    customerName: 'Pedro Oliveira',
    items: [
      {
        idProduct: PRODUCTS_SEED[3].id!,
        productName: PRODUCTS_SEED[3].title,
        quantity: 5,
        priceAtSale: 3.90,
        priceAtCost: 1.20
      }
    ],
    itemsTotal: 19.50,
    shippingCost: 8.00,
    total: 27.50,
    deliveryType: 'delivery',
    address: 'Rua B, 456, Jardins, Sao Paulo',
    addressLat: -23.5632,
    addressLng: -46.6803,
    status: 'preparing',
    createdAt: createTimestamp(10),
    scheduledDate: createTimestamp(8)
  },
  {
    id: generateMockId('order'),
    customerName: 'Cliente Desconhecido 1',
    items: [
      {
        idProduct: PRODUCTS_SEED[5].id!,
        productName: PRODUCTS_SEED[5].title,
        quantity: 2,
        priceAtSale: 6.90,
        priceAtCost: 2.50
      }
    ],
    itemsTotal: 13.80,
    shippingCost: 0,
    total: 13.80,
    deliveryType: 'pickup',
    status: 'ready',
    createdAt: createTimestamp(7),
    scheduledDate: createTimestamp(6)
  },
  {
    id: generateMockId('order'),
    customerName: 'Cliente Desconhecido 2',
    items: [
      {
        idProduct: PRODUCTS_SEED[6].id!,
        productName: PRODUCTS_SEED[6].title,
        quantity: 10,
        priceAtSale: 3.50,
        priceAtCost: 1.00
      }
    ],
    itemsTotal: 35.00,
    shippingCost: 7.50,
    total: 42.50,
    deliveryType: 'delivery',
    address: 'Avenida X, 999, Zona Norte',
    addressLat: -23.4456,
    addressLng: -46.4890,
    status: 'delivering',
    createdAt: createTimestamp(5),
    scheduledDate: createTimestamp(3),
    actualDeliveryDate: createTimestamp(2)
  },
  {
    id: generateMockId('order'),
    customerName: 'Lucia Ferreira',
    customerPhone: '(61) 97654-5678',
    items: [
      {
        idProduct: PRODUCTS_SEED[8].id!,
        productName: PRODUCTS_SEED[8].title,
        quantity: 1,
        priceAtSale: 2.00,
        priceAtCost: 0.50
      }
    ],
    itemsTotal: 2.00,
    shippingCost: 5.00,
    total: 7.00,
    deliveryType: 'pickup',
    status: 'delivered',
    createdAt: createTimestamp(20),
    scheduledDate: createTimestamp(18),
    actualDeliveryDate: createTimestamp(17)
  },
  {
    id: generateMockId('order'),
    customerName: 'Cliente Teste',
    items: [
      {
        idProduct: PRODUCTS_SEED[11].id!,
        productName: PRODUCTS_SEED[11].title,
        quantity: 2,
        priceAtSale: 7.50,
        priceAtCost: 2.80
      }
    ],
    itemsTotal: 15.00,
    shippingCost: 6.00,
    total: 21.00,
    deliveryType: 'delivery',
    address: 'Endereco para entrega',
    status: 'finished',
    createdAt: createTimestamp(25),
    scheduledDate: createTimestamp(23),
    actualDeliveryDate: createTimestamp(21),
    paymentDate: createTimestamp(21),
    closingDate: createTimestamp(21)
  },
  {
    id: generateMockId('order'),
    customerName: 'Cliente Cancelado',
    items: [
      {
        idProduct: PRODUCTS_SEED[4].id!,
        productName: PRODUCTS_SEED[4].title,
        quantity: 1,
        priceAtSale: 12.50,
        priceAtCost: 5.00
      }
    ],
    itemsTotal: 12.50,
    shippingCost: 5.00,
    total: 17.50,
    deliveryType: 'pickup',
    status: 'canceled',
    createdAt: createTimestamp(30),
    scheduledDate: createTimestamp(28)
  }
];
