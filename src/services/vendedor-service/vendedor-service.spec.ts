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

  describe('Regra: Agregacao por produto - campo itens (CRITICA)', () => {
    it('Caso 14: Um pedido com um item - itens deve ter uma entrada com quantidade e totais corretos', () => {
      const vendedor = createVendedor('v1', 'João', [
        { idProduct: 'prod-A', percentual: 10 }
      ]);

      const item = createOrderItem('prod-A', 2, 100); // quantidade=2, totalVendido=200, comissao=20
      const order = createOrder('v1', 'finished', [item], 0);

      const result = VendedorService.calculateComissaoVendedor([order], vendedor);

      expect(result.itens).toBeDefined();
      expect(result.itens.length).toBe(1, 'um produto deve gerar uma entrada em itens');
      expect(result.itens[0]).toEqual({
        idProduct: 'prod-A',
        productName: 'Product prod-A',
        quantidade: 2,
        totalVendido: 200,
        totalComissao: 20,
        percentual: 10
      });
    });

    it('Caso 15: Mesmo produto em dois pedidos finished qualificados - agrupado numa unica entrada em itens com somas', () => {
      const vendedor = createVendedor('v1', 'João', [
        { idProduct: 'prod-A', percentual: 10 }
      ]);

      // Pedido 1: prod-A 1 unidade * 100 = 100 vendido
      const item1 = createOrderItem('prod-A', 1, 100);
      const order1 = createOrder('v1', 'finished', [item1], 0);

      // Pedido 2: prod-A 2 unidades * 50 = 100 vendido
      const item2 = createOrderItem('prod-A', 2, 50);
      const order2 = createOrder('v1', 'finished', [item2], 0);

      const result = VendedorService.calculateComissaoVendedor([order1, order2], vendedor);

      expect(result.itens.length).toBe(1, 'mesmo produto em pedidos diferentes = uma unica entrada');
      expect(result.itens[0]).toEqual({
        idProduct: 'prod-A',
        productName: 'Product prod-A',
        quantidade: 3, // 1 + 2
        totalVendido: 200, // 100 + 100
        totalComissao: 20, // 200 * 10 / 100
        percentual: 10
      });
    });

    it('Caso 16: Multiplos produtos em um pedido - cada um gera entrada em itens', () => {
      const vendedor = createVendedor('v1', 'João', [
        { idProduct: 'prod-A', percentual: 10 },
        { idProduct: 'prod-B', percentual: 20 }
      ]);

      const itemA = createOrderItem('prod-A', 1, 100);
      const itemB = createOrderItem('prod-B', 1, 50);
      const order = createOrder('v1', 'finished', [itemA, itemB], 0);

      const result = VendedorService.calculateComissaoVendedor([order], vendedor);

      expect(result.itens.length).toBe(2, 'dois produtos diferentes = duas entradas em itens');
      const prodAEntry = result.itens.find(i => i.idProduct === 'prod-A');
      const prodBEntry = result.itens.find(i => i.idProduct === 'prod-B');

      expect(prodAEntry).toEqual({
        idProduct: 'prod-A',
        productName: 'Product prod-A',
        quantidade: 1,
        totalVendido: 100,
        totalComissao: 10,
        percentual: 10
      });

      expect(prodBEntry).toEqual({
        idProduct: 'prod-B',
        productName: 'Product prod-B',
        quantidade: 1,
        totalVendido: 50,
        totalComissao: 10,
        percentual: 20
      });
    });

    it('Caso 17: Produto SEM comissao cadastrada - deve entrar em itens com percentual 0 e totalComissao 0', () => {
      const vendedor = createVendedor('v1', 'João', [
        { idProduct: 'prod-B', percentual: 5 } // prod-A nao tem comissao
      ]);

      const item = createOrderItem('prod-A', 2, 50); // produto sem comissao
      const order = createOrder('v1', 'finished', [item], 0);

      const result = VendedorService.calculateComissaoVendedor([order], vendedor);

      expect(result.itens.length).toBe(1, 'produto sem comissao ainda aparece em itens');
      expect(result.itens[0]).toEqual({
        idProduct: 'prod-A',
        productName: 'Product prod-A',
        quantidade: 2,
        totalVendido: 100,
        totalComissao: 0,
        percentual: 0
      });
    });

    it('Caso 18: Pedido nao-finished nao aparece em itens (pending)', () => {
      const vendedor = createVendedor('v1', 'João', [
        { idProduct: 'prod-A', percentual: 10 }
      ]);

      const item = createOrderItem('prod-A', 1, 100);
      const orderPending = createOrder('v1', 'pending', [item], 0);
      const orderFinished = createOrder('v1', 'finished', [item], 0);

      const result = VendedorService.calculateComissaoVendedor(
        [orderPending, orderFinished],
        vendedor
      );

      expect(result.itens.length).toBe(1, 'apenas pedido finished conta');
      expect(result.itens[0].quantidade).toBe(1, 'apenas 1 unidade (do pedido finished)');
    });

    it('Caso 19: Pedido de outro vendedor nao aparece em itens', () => {
      const vendedor = createVendedor('v1', 'João', [
        { idProduct: 'prod-A', percentual: 10 }
      ]);

      const item1 = createOrderItem('prod-A', 1, 100);
      const item2 = createOrderItem('prod-A', 2, 100);
      const orderV1 = createOrder('v1', 'finished', [item1], 0);
      const orderV2 = createOrder('v2', 'finished', [item2], 0);

      const result = VendedorService.calculateComissaoVendedor([orderV1, orderV2], vendedor);

      expect(result.itens.length).toBe(1, 'apenas itens de v1 contam');
      expect(result.itens[0].quantidade).toBe(1, 'apenas 1 unidade (do pedido v1)');
    });

    it('Caso 20: Lista vazia de orders - itens deve ser array vazio', () => {
      const vendedor = createVendedor('v1', 'João', [
        { idProduct: 'prod-A', percentual: 10 }
      ]);

      const result = VendedorService.calculateComissaoVendedor([], vendedor);

      expect(result.itens).toBeDefined();
      expect(result.itens.length).toBe(0, 'lista vazia de orders = itens vazio');
    });

    it('Caso 21: Nenhum pedido qualificado (todos pending ou outro vendedor) - itens vazio', () => {
      const vendedor = createVendedor('v1', 'João', [
        { idProduct: 'prod-A', percentual: 10 }
      ]);

      const item1 = createOrderItem('prod-A', 1, 100);
      const item2 = createOrderItem('prod-A', 1, 100);
      const orderPending = createOrder('v1', 'pending', [item1], 0);
      const orderOtherVendedor = createOrder('v2', 'finished', [item2], 0);

      const result = VendedorService.calculateComissaoVendedor(
        [orderPending, orderOtherVendedor],
        vendedor
      );

      expect(result.itens.length).toBe(0, 'nenhum pedido qualificado = itens vazio');
    });

    it('Caso 22: Ordenacao de itens por totalVendido descendente', () => {
      const vendedor = createVendedor('v1', 'João', [
        { idProduct: 'prod-A', percentual: 10 },
        { idProduct: 'prod-B', percentual: 10 },
        { idProduct: 'prod-C', percentual: 10 }
      ]);

      // prod-A: 1 * 50 = 50
      // prod-B: 3 * 100 = 300 (maior)
      // prod-C: 2 * 75 = 150
      const itemA = createOrderItem('prod-A', 1, 50);
      const itemB = createOrderItem('prod-B', 3, 100);
      const itemC = createOrderItem('prod-C', 2, 75);
      const order = createOrder('v1', 'finished', [itemA, itemB, itemC], 0);

      const result = VendedorService.calculateComissaoVendedor([order], vendedor);

      expect(result.itens.length).toBe(3);
      expect(result.itens[0].idProduct).toBe('prod-B', 'primeiro = maior totalVendido (300)');
      expect(result.itens[1].idProduct).toBe('prod-C', 'segundo = medio totalVendido (150)');
      expect(result.itens[2].idProduct).toBe('prod-A', 'terceiro = menor totalVendido (50)');
    });

    it('Caso 23: Ordenacao por productName (localeCompare pt-BR) quando totalVendido e empate', () => {
      const vendedor = createVendedor('v1', 'João', [
        { idProduct: 'prod-zebra', percentual: 10 },
        { idProduct: 'prod-apple', percentual: 10 },
        { idProduct: 'prod-banana', percentual: 10 }
      ]);

      // Todos com mesmo totalVendido (100), devem ordenar por productName
      // productName é "Product prod-{id}"
      // "Product prod-apple" < "Product prod-banana" < "Product prod-zebra"
      const itemZ = createOrderItem('prod-zebra', 1, 100);
      const itemA = createOrderItem('prod-apple', 1, 100);
      const itemB = createOrderItem('prod-banana', 1, 100);
      const order = createOrder('v1', 'finished', [itemZ, itemA, itemB], 0);

      const result = VendedorService.calculateComissaoVendedor([order], vendedor);

      expect(result.itens.length).toBe(3);
      expect(result.itens[0].idProduct).toBe('prod-apple', 'alphabeticamente primeiro');
      expect(result.itens[1].idProduct).toBe('prod-banana', 'alphabeticamente segundo');
      expect(result.itens[2].idProduct).toBe('prod-zebra', 'alphabeticamente terceiro');
    });

    it('Caso 24: Mesmo produto em multiplos pedidos com ordem alternada - productName vem da primeira ocorrencia encontrada', () => {
      const vendedor = createVendedor('v1', 'João', [
        { idProduct: 'prod-A', percentual: 10 }
      ]);

      // Cria dois OrderItems diferentes, com productName diferente (nao usual na pratica, mas testa o requisito)
      const customItem1: OrderItem = {
        idProduct: 'prod-A',
        productName: 'Custom Name 1',
        quantity: 1,
        priceAtSale: 100,
        priceAtCost: 10
      };

      const customItem2: OrderItem = {
        idProduct: 'prod-A',
        productName: 'Custom Name 2',
        quantity: 1,
        priceAtSale: 100,
        priceAtCost: 10
      };

      const order1 = createOrder('v1', 'finished', [customItem1], 0);
      const order2 = createOrder('v1', 'finished', [customItem2], 0);

      const result = VendedorService.calculateComissaoVendedor([order1, order2], vendedor);

      expect(result.itens.length).toBe(1);
      expect(result.itens[0].productName).toBe('Custom Name 1', 'productName vem da primeira ocorrencia');
    });

    it('Caso 25: Calculo correto de comissao por item: quantidade soma, percentual e totalComissao calculam direito', () => {
      const vendedor = createVendedor('v1', 'João', [
        { idProduct: 'prod-A', percentual: 15 } // 15% de comissao
      ]);

      // Pedido 1: 2 unidades * 100 = 200 (comissao: 200 * 15% = 30)
      // Pedido 2: 3 unidades * 200 = 600 (comissao: 600 * 15% = 90)
      // Total esperado: 5 unidades, 800 vendido, 120 comissao
      const item1 = createOrderItem('prod-A', 2, 100);
      const item2 = createOrderItem('prod-A', 3, 200);
      const order1 = createOrder('v1', 'finished', [item1], 0);
      const order2 = createOrder('v1', 'finished', [item2], 0);

      const result = VendedorService.calculateComissaoVendedor([order1, order2], vendedor);

      expect(result.itens.length).toBe(1);
      expect(result.itens[0]).toEqual({
        idProduct: 'prod-A',
        productName: 'Product prod-A',
        quantidade: 5,
        totalVendido: 800,
        totalComissao: 120,
        percentual: 15
      });
    });

    it('Caso 26: Frete nao afeta itens - shippingCost ignorado na agregacao', () => {
      const vendedor = createVendedor('v1', 'João', [
        { idProduct: 'prod-A', percentual: 10 }
      ]);

      const item = createOrderItem('prod-A', 2, 100);
      const order = createOrder('v1', 'finished', [item], 50); // shippingCost = 50

      const result = VendedorService.calculateComissaoVendedor([order], vendedor);

      expect(result.itens.length).toBe(1);
      expect(result.itens[0].totalVendido).toBe(200, 'frete nao entra em totalVendido do item');
      expect(result.itens[0].totalComissao).toBe(20, 'comissao calculada sobre 200, nao 250');
    });
  });
});
