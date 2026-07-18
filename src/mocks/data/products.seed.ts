import { Product } from '../../models/product-model';
import { generateMockId } from '../core/mock-id';

export const PRODUCTS_SEED: Product[] = [
  {
    id: generateMockId('prod'),
    title: 'Refrigerante 2L',
    buyPrice: 3.50,
    sellPrice: 7.90,
    stock: 15,
    urlImage: 'https://via.placeholder.com/200?text=Refri',
    color: 'red'
  },
  {
    id: generateMockId('prod'),
    title: 'Suco Natural Laranja',
    buyPrice: 2.00,
    sellPrice: 5.50,
    stock: 0,
    urlImage: 'https://via.placeholder.com/200?text=Suco',
    color: 'orange'
  },
  {
    id: generateMockId('prod'),
    title: 'Cerveja Artesanal 600ml',
    buyPrice: 8.00,
    sellPrice: 16.90,
    stock: 2,
    urlImage: 'https://via.placeholder.com/200?text=Cerveja'
  },
  {
    id: generateMockId('prod'),
    title: 'Agua Mineral com Gas',
    buyPrice: 1.20,
    sellPrice: 3.90,
    stock: 72,
    urlImage: 'https://via.placeholder.com/200?text=Agua'
  },
  {
    id: generateMockId('prod'),
    title: 'Sanduiche de Queijo',
    buyPrice: 5.00,
    sellPrice: 12.50,
    stock: 1,
    color: 'brown'
  },
  {
    id: generateMockId('prod'),
    title: 'Pasteis Sortidos',
    buyPrice: 2.50,
    sellPrice: 6.90,
    stock: 8,
    urlImage: 'https://via.placeholder.com/200?text=Pasteis'
  },
  {
    id: generateMockId('prod'),
    title: 'Cafe Coado',
    buyPrice: 1.00,
    sellPrice: 3.50,
    stock: 125,
    urlImage: 'https://via.placeholder.com/200?text=Cafe',
    color: 'brown'
  },
  {
    id: generateMockId('prod'),
    title: 'Chopp Gelado',
    buyPrice: 6.00,
    sellPrice: 14.90,
    stock: 5,
    urlImage: 'https://via.placeholder.com/200?text=Chopp'
  },
  {
    id: generateMockId('prod'),
    title: 'Agua Quente para Cha',
    buyPrice: 0.50,
    sellPrice: 2.00,
    stock: 0
  },
  {
    id: generateMockId('prod'),
    title: 'Refrigerante Lata',
    buyPrice: 2.00,
    sellPrice: 4.90,
    stock: 32,
    color: 'silver'
  },
  {
    id: generateMockId('prod'),
    title: 'Acaraje',
    buyPrice: 3.50,
    sellPrice: 8.90,
    stock: 3,
    urlImage: 'https://via.placeholder.com/200?text=Acaraje'
  },
  {
    id: generateMockId('prod'),
    title: 'Agua de Coco',
    buyPrice: 2.80,
    sellPrice: 7.50,
    stock: 55,
    urlImage: 'https://via.placeholder.com/200?text=Agua+Coco'
  }
];
