import { VendedorService } from './vendedor-service';
import { Vendedor, ComissaoVendedorResultado } from '../../models/vendedor-model';
import { Order, OrderItem } from '../../models/order-model';
import { Timestamp } from '@angular/fire/firestore';

describe('VendedorService.calculateComissaoVendedor - Calculo de comissao a pagar [CRITICA]', () => {
  // Helper para criar um OrderItem
  function createOrderItem(
    idProduct: string,
    quantity: number,
    priceAtSale: number
  ): OrderItem {
    return {
      idProduct,
      productName: `Product ${idProduct}`,
      quantity,
      priceAtSale,
      priceAtCost: 10 // valor fixo, nao afeta comissao
    };
  }

  // Helper para criar um Order
  function createOrder(
    vendedorId: string | undefined,
    status: string,
    items: OrderItem[],
    shippingCost: number = 0
  ): Order {
    const itemsTotal = items.reduce((sum, item) => sum + (item.priceAtSale * item.quantity), 0);
    return {
      id: `order-${Date.now()}`,
      companyId: 'company-1',
      orderNumber: 1,
      customerName: 'Test Customer',
      items,
      itemsTotal,
      shippingCost,
      total: itemsTotal + shippingCost,
      deliveryType: 'pickup',
      status: status as any,
      createdAt: Timestamp.now(),
      vendedorId
    };
  }

  // Helper para criar um Vendedor com comissoes
  function createVendedor(
    id: string | undefined,
    name: string,
    comissoes: { idProduct: string; percentual: number }[] = []
  ): Vendedor {
    const vendedor: Vendedor = {
      companyId: 'company-1',
      name,
      comissoes
    };
    if (id !== undefined) {
      vendedor.id = id;
    }
    return vendedor;
  }

  describe('Regra: Filtragem por status finished + vendedorId correto (CRITICA)', () => {
    it('Caso 1: Pedido finished do vendedor certo com produto 10% - calcula comissao corretamente', () => {
      const vendedor = createVendedor('v1', 'João', [
        { idProduct: 'prod-A', percentual: 10 }
      ]);

      const item = createOrderItem('prod-A', 2, 100); // vendidoItem = 100 * 2 = 200
      const order = createOrder('v1', 'finished', [item], 0);

      const result = VendedorService.calculateComissaoVendedor([order], vendedor);

      expect(result.vendedorId).toBe('v1');
      expect(result.vendedorName).toBe('João');
      expect(result.totalVendido).toBe(200, 'vendidoItem = 100 * 2');
      expect(result.totalComissao).toBe(20, 'comissaoItem = 200 * 10 / 100');
    });

    it('Caso 2: Pedido finished do vendedor certo com produto SEM % cadastrado - soma em totalVendido, 0 em comissao', () => {
      const vendedor = createVendedor('v1', 'João', [
        { idProduct: 'prod-B', percentual: 5 } // prod-A nao esta aqui
      ]);

      const item = createOrderItem('prod-A', 1, 50); // produto nao tem comissao
      const order = createOrder('v1', 'finished', [item], 0);

      const result = VendedorService.calculateComissaoVendedor([order], vendedor);

      expect(result.totalVendido).toBe(50, 'produto sem comissao continua na base de venda');
      expect(result.totalComissao).toBe(0, 'sem percentual cadastrado = 0% comissao');
    });

    it('Caso 3: Pedido de OUTRO vendedor - completamente ignorado', () => {
      const vendedor = createVendedor('v1', 'João', [
        { idProduct: 'prod-A', percentual: 10 }
      ]);

      const item = createOrderItem('prod-A', 1, 100);
      const order = createOrder('v2', 'finished', [item], 0); // vendedorId diferente

      const result = VendedorService.calculateComissaoVendedor([order], vendedor);

      expect(result.totalVendido).toBe(0, 'pedido de outro vendedor nao contribui');
      expect(result.totalComissao).toBe(0, 'pedido de outro vendedor nao contribui');
    });

    it('Caso 4: Pedido pending do mesmo vendedor - ignorado (nao e finished)', () => {
      const vendedor = createVendedor('v1', 'João', [
        { idProduct: 'prod-A', percentual: 10 }
      ]);

      const item = createOrderItem('prod-A', 1, 100);
      const order = createOrder('v1', 'pending', [item], 0); // status nao e finished

      const result = VendedorService.calculateComissaoVendedor([order], vendedor);

      expect(result.totalVendido).toBe(0, 'pedido nao-finalizado nao entra no calculo');
      expect(result.totalComissao).toBe(0, 'pedido nao-finalizado nao entra no calculo');
    });
  });

  describe('Regra: Frete (shippingCost) NUNCA entra na base de calculo (CRITICA)', () => {
    it('Caso 5: Pedido com shippingCost preenchido - excluido de totalVendido', () => {
      const vendedor = createVendedor('v1', 'João', [
        { idProduct: 'prod-A', percentual: 10 }
      ]);

      const item = createOrderItem('prod-A', 1, 100); // vendidoItem = 100
      const order = createOrder('v1', 'finished', [item], 50); // shippingCost = 50

      const result = VendedorService.calculateComissaoVendedor([order], vendedor);

      expect(result.totalVendido).toBe(100, 'frete nao entra em totalVendido');
      expect(result.totalComissao).toBe(10, 'comissao calculada sobre 100, nao 150');
      // total do pedido seria 150, mas comissao e so sobre os 100 do produto
    });
  });

  describe('Regra: Multiplos pedidos e itens - soma correta (CRITICA)', () => {
    it('Caso 6: Multiplos pedidos finished qualificados - soma todos corretamente', () => {
      const vendedor = createVendedor('v1', 'João', [
        { idProduct: 'prod-A', percentual: 10 },
        { idProduct: 'prod-B', percentual: 20 }
      ]);

      // Pedido 1: prod-A 100 (2 unidades) = 200 vendido, 20 comissao
      const item1a = createOrderItem('prod-A', 2, 100);
      const order1 = createOrder('v1', 'finished', [item1a], 0);

      // Pedido 2: prod-A 50 (1 unidade) + prod-B 50 (1 unidade)
      // prod-A: 50 vendido, 5 comissao
      // prod-B: 50 vendido, 10 comissao
      const item2a = createOrderItem('prod-A', 1, 50);
      const item2b = createOrderItem('prod-B', 1, 50);
      const order2 = createOrder('v1', 'finished', [item2a, item2b], 0);

      const result = VendedorService.calculateComissaoVendedor([order1, order2], vendedor);

      // totalVendido = 200 + 50 + 50 = 300
      // totalComissao = 20 + 5 + 10 = 35
      expect(result.totalVendido).toBe(300, 'soma todos os itens qualificados');
      expect(result.totalComissao).toBe(35, 'soma todas as comissoes');
    });
  });

  describe('Regra: Lista vazia - resultado zerado (CRITICA)', () => {
    it('Caso 7: Array vazio de orders - totalVendido e totalComissao = 0', () => {
      const vendedor = createVendedor('v1', 'João', [
        { idProduct: 'prod-A', percentual: 10 }
      ]);

      const result = VendedorService.calculateComissaoVendedor([], vendedor);

      expect(result.vendedorId).toBe('v1');
      expect(result.vendedorName).toBe('João');
      expect(result.totalVendido).toBe(0, 'lista vazia resulta em 0');
      expect(result.totalComissao).toBe(0, 'lista vazia resulta em 0');
    });
  });

  describe('CRITICA - BUG: Vínculo undefined - pedido sem vendedor NÃO deve ser contado pra vendedor sem id', () => {
    it('Caso 8: Vendedor sem id + pedido finished sem vendedorId - resultado deve ser zerado', () => {
      // Bug: quando vendedor.id e order.vendedorId sao ambos undefined,
      // a comparacao undefined === undefined vira true, contando o pedido incorretamente
      const vendedor = createVendedor(undefined, 'Carlos', [
        { idProduct: 'prod-A', percentual: 15 }
      ]);

      // Pedido finished SEM vendedor vinculado (vendedorId = undefined)
      const item = createOrderItem('prod-A', 2, 100); // vendidoItem = 200, deveria gerar 30 de comissao
      const order = createOrder(undefined, 'finished', [item], 0);

      const result = VendedorService.calculateComissaoVendedor([order], vendedor);

      // O pedido NAO tem vendedor, entao NAO deve ser contado
      expect(result.totalVendido).toBe(0, 'pedido sem vendedor nao contribui, mesmo se vendedor.id e undefined');
      expect(result.totalComissao).toBe(0, 'pedido sem vendedor nao contribui, mesmo se vendedor.id e undefined');
    });
  });

  describe('Casos adicionais - Combinacoes de filtro e borda', () => {
    it('Mix: array com finished+pending, vendedores mistos - filtra corretamente', () => {
      const vendedor = createVendedor('v1', 'João', [
        { idProduct: 'prod-A', percentual: 10 }
      ]);

      // Pedido qualificado (finished, v1)
      const item1 = createOrderItem('prod-A', 1, 100);
      const order1 = createOrder('v1', 'finished', [item1], 0);

      // Pedido NAO qualificado (pending, v1)
      const item2 = createOrderItem('prod-A', 1, 100);
      const order2 = createOrder('v1', 'pending', [item2], 0);

      // Pedido NAO qualificado (finished, v2)
      const item3 = createOrderItem('prod-A', 1, 100);
      const order3 = createOrder('v2', 'finished', [item3], 0);

      const result = VendedorService.calculateComissaoVendedor(
        [order1, order2, order3],
        vendedor
      );

      expect(result.totalVendido).toBe(100, 'apenas order1 (finished + v1) conta');
      expect(result.totalComissao).toBe(10, 'apenas order1 (finished + v1) conta');
    });

    it('Pedido finished de v1 com frete + pedido finished de v2 - frete ignorado, v2 ignorado', () => {
      const vendedor = createVendedor('v1', 'João', [
        { idProduct: 'prod-A', percentual: 15 }
      ]);

      // Pedido qualificado (finished, v1, com frete)
      const item1 = createOrderItem('prod-A', 2, 75); // vendidoItem = 150
      const order1 = createOrder('v1', 'finished', [item1], 30); // frete ignorado

      // Pedido nao qualificado (finished, v2)
      const item2 = createOrderItem('prod-A', 1, 50);
      const order2 = createOrder('v2', 'finished', [item2], 10);

      const result = VendedorService.calculateComissaoVendedor(
        [order1, order2],
        vendedor
      );

      // totalVendido = 150 (v2 nao conta, frete de v1 nao conta)
      // totalComissao = 150 * 15 / 100 = 22.5
      expect(result.totalVendido).toBe(150);
      expect(result.totalComissao).toBe(22.5);
    });
  });

  describe('Regra: Calculo preciso de percentual', () => {
    it('Percentuais diversos (5%, 15%, 25%) - calculo correto', () => {
      const vendedor = createVendedor('v1', 'Maria', [
        { idProduct: 'prod-A', percentual: 5 },
        { idProduct: 'prod-B', percentual: 15 },
        { idProduct: 'prod-C', percentual: 25 }
      ]);

      const item1 = createOrderItem('prod-A', 1, 100); // 100 * 5% = 5
      const item2 = createOrderItem('prod-B', 1, 100); // 100 * 15% = 15
      const item3 = createOrderItem('prod-C', 1, 100); // 100 * 25% = 25
      const order = createOrder('v1', 'finished', [item1, item2, item3], 0);

      const result = VendedorService.calculateComissaoVendedor([order], vendedor);

      expect(result.totalVendido).toBe(300);
      expect(result.totalComissao).toBe(45, '5 + 15 + 25');
    });

    it('Quantidade > 1 com percentual - multiplicacao correta', () => {
      const vendedor = createVendedor('v1', 'Pedro', [
        { idProduct: 'prod-X', percentual: 20 }
      ]);

      // 5 unidades de 10 reais cada = 50 vendido, 20% = 10 comissao
      const item = createOrderItem('prod-X', 5, 10);
      const order = createOrder('v1', 'finished', [item], 0);

      const result = VendedorService.calculateComissaoVendedor([order], vendedor);

      expect(result.totalVendido).toBe(50);
      expect(result.totalComissao).toBe(10);
    });
  });

  describe('Regra: Retorno da estrutura ComissaoVendedorResultado', () => {
    it('Resultado deve conter vendedorId e vendedorName do parametro Vendedor', () => {
      const vendedor = createVendedor('seller-123', 'Roberto Silva', [
        { idProduct: 'prod-A', percentual: 10 }
      ]);

      const item = createOrderItem('prod-A', 1, 100);
      const order = createOrder('seller-123', 'finished', [item], 0);

      const result = VendedorService.calculateComissaoVendedor([order], vendedor);

      expect(result).toEqual(jasmine.objectContaining({
        vendedorId: 'seller-123',
        vendedorName: 'Roberto Silva',
        totalVendido: jasmine.any(Number),
        totalComissao: jasmine.any(Number)
      }));
    });
  });
});
