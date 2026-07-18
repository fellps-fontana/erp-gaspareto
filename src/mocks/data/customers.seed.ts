import { Customer } from '../../models/customer-model';
import { generateMockId } from '../core/mock-id';

export const CUSTOMERS_SEED: Customer[] = [
  {
    id: generateMockId('cust'),
    name: 'Joao Silva',
    phone: '(11) 98765-4321',
    address: 'Rua A, 123, Apartamento 201, Bairro Centro, Sao Paulo, SP',
    cep: '01310-100',
    rua: 'Rua A',
    numero: '123',
    complemento: 'Apartamento 201',
    bairro: 'Centro',
    cidade: 'Sao Paulo',
    uf: 'SP',
    lat: -23.5505,
    lng: -46.6333
  },
  {
    id: generateMockId('cust'),
    name: 'Maria Santos',
    phone: '(11) 99876-5432',
    address: 'Avenida Paulista, 1000, Bloco B, Vila Mariana, Sao Paulo, SP',
    cep: '01311-100',
    rua: 'Avenida Paulista',
    numero: '1000',
    complemento: 'Bloco B',
    bairro: 'Vila Mariana',
    cidade: 'Sao Paulo',
    uf: 'SP',
    lat: -23.5615,
    lng: -46.6560
  },
  {
    id: generateMockId('cust'),
    name: 'Pedro Oliveira',
    phone: '(11) 97654-3210',
    address: 'Rua B, 456, Jardins, Sao Paulo, SP',
    cep: '01425-000',
    rua: 'Rua B',
    numero: '456',
    bairro: 'Jardins',
    cidade: 'Sao Paulo',
    uf: 'SP',
    lat: -23.5632,
    lng: -46.6803
  },
  {
    id: generateMockId('cust'),
    name: 'Ana Costa',
    phone: '(21) 98765-1234',
    address: 'Endereco solto no Rio de Janeiro - Copacabana, proximo ao metro'
  },
  {
    id: generateMockId('cust'),
    name: 'Carlos Mendes',
    phone: '(85) 99876-4321',
    address: 'Rua C, 789, Aldeota, Fortaleza, CE',
    cep: '60140-120',
    rua: 'Rua C',
    numero: '789',
    bairro: 'Aldeota',
    cidade: 'Fortaleza',
    uf: 'CE',
    lat: -3.7315,
    lng: -38.5213
  },
  {
    id: generateMockId('cust'),
    name: 'Lucia Ferreira',
    phone: '(61) 97654-5678',
    address: 'Avenida W3 Sul, 505, Asa Sul, Brasilia, DF',
    cep: '70680-500',
    rua: 'Avenida W3 Sul',
    numero: '505',
    bairro: 'Asa Sul',
    cidade: 'Brasilia',
    uf: 'DF',
    lat: -15.8267,
    lng: -47.8822
  }
];
