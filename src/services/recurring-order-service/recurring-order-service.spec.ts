import { TestBed } from '@angular/core/testing';
import { RecurringOrderService, ResumoDaGeracao } from './recurring-order-service';
import { TenantService } from '../tenant-service/tenant-service';
import { Order } from '../../models/order-model';
import { Firestore, Timestamp } from '@angular/fire/firestore';
import { setDoc, doc, collection, query, where, getDoc, getDocs } from 'firebase/firestore';
import { setupFirestoreEmulatorTest, EmulatorTestSetup, setupSecondUserContext } from '../test-helpers';
import { firstValueFrom } from 'rxjs';
import { AgendaDeRecorrencia, RecorrenciaInvalidaError } from './recurrence-rules';

// "Hoje" fixo: nenhum teste depende do relogio real.
const AGORA = new Date(2026, 9, 21, 10, 0, 0); // 2026-10-21 (hoje civil)
const DATA_OCORRENCIA = '2026-10-21';
const SUFIXO_DATA_OCORRENCIA = '20261021';
const PRECO_VENDA = 25;
const PRECO_CUSTO = 15;

function aleatorio(): string {
  return Math.random().toString(36).slice(2, 10);
}

describe('RecurringOrderService - Multi-tenant e regras do pedido recorrente (CRÍTICA)', () => {
  let service: RecurringOrderService;
  let setup: EmulatorTestSetup;

  const companyId = (): string => setup.mockCompanyId as string;

  beforeEach(async () => {
    setup = await setupFirestoreEmulatorTest();
    TestBed.configureTestingModule({
      providers: [
        RecurringOrderService,
        { provide: TenantService, useValue: setup.tenantService },
        { provide: Firestore, useValue: setup.firestore }
      ]
    });
    service = TestBed.inject(RecurringOrderService);
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  // ---------- Helpers (seed direto no emulador; o service so e exercitado nas chamadas) ----------

  async function seedProduto(label = 'pao'): Promise<string> {
    const id = `prod-${label}-${aleatorio()}`;
    await setDoc(doc(setup.firestore, `products/${id}`), {
      companyId: companyId(),
      title: `Produto ${label}`,
      buyPrice: PRECO_CUSTO,
      sellPrice: PRECO_VENDA,
      stock: 100,
      soldByWeight: false
    });
    return id;
  }

  async function seedContador(nextOrderNumber: number): Promise<void> {
    await setDoc(doc(setup.firestore, `counters/${companyId()}`), { nextOrderNumber });
  }

  async function lerContador(): Promise<number> {
    const snap = await getDoc(doc(setup.firestore, `counters/${companyId()}`));
    return snap.data()?.['nextOrderNumber'];
  }

  function itemDoModelo(idProduct: string, quantity = 2, productName = 'Pao Frances') {
    return { idProduct, productName, quantity, soldByWeight: false };
  }

  /** Grava modelo ativo (weekly, startDate 2026-10-14) com um item do produto informado. */
  async function seedModelo(produtoId: string, overrides: Record<string, unknown> = {}): Promise<string> {
    const id = `rec-${aleatorio()}`;
    await setDoc(doc(setup.firestore, `recurringOrders/${id}`), {
      companyId: companyId(),
      status: 'active',
      frequency: 'weekly',
      startDate: '2026-10-14',
      generateFrom: '2026-10-14',
      customerName: 'Cliente recorrente',
      items: [itemDoModelo(produtoId)],
      shippingCost: 5,
      deliveryType: 'delivery',
      address: 'Rua das Flores, 100',
      createdAt: Timestamp.now(),
      ...overrides
    });
    return id;
  }

  async function lerModelo(recId: string): Promise<any> {
    const snap = await getDoc(doc(setup.firestore, `recurringOrders/${recId}`));
    return snap.data();
  }

  /**
   * Pedido gerado para a ocorrencia (recId, data yyyyMMdd), achado por consulta filtrada
   * (companyId + recurringOrderId + occurrenceDate), nunca por getDoc em id que pode nao existir:
   * as rules negam leitura sem companyId. Devolve {id, ...dados} ou undefined.
   */
  async function lerPedidoDaOcorrencia(recId: string, sufixoData = SUFIXO_DATA_OCORRENCIA): Promise<any> {
    const dataCivil = `${sufixoData.slice(0, 4)}-${sufixoData.slice(4, 6)}-${sufixoData.slice(6, 8)}`;
    const snap = await getDocs(query(
      collection(setup.firestore, 'orders'),
      where('companyId', '==', companyId()),
      where('recurringOrderId', '==', recId),
      where('occurrenceDate', '==', dataCivil)
    ));
    if (snap.size === 0) return undefined;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  }

  async function contarPedidosDoModelo(recId: string): Promise<number> {
    const snap = await getDocs(query(
      collection(setup.firestore, 'orders'),
      where('companyId', '==', companyId()),
      where('recurringOrderId', '==', recId)
    ));
    return snap.size;
  }

  async function contarModelos(): Promise<number> {
    const snap = await getDocs(query(
      collection(setup.firestore, 'recurringOrders'),
      where('companyId', '==', companyId())
    ));
    return snap.size;
  }

  async function capturarErro(operacao: () => Promise<unknown>): Promise<any> {
    try {
      await operacao();
    } catch (erro) {
      return erro;
    }
    return undefined;
  }

  function pedidoDeOrigem(overrides: Partial<Order> = {}): Order {
    const agora = Timestamp.fromDate(AGORA);
    return {
      id: `ped-origem-${aleatorio()}`,
      companyId: companyId(),
      orderNumber: 3,
      customerName: 'Cliente recorrente',
      customerId: 'cli-1',
      items: [
        { idProduct: 'prod-origem', productName: 'Pao Frances', quantity: 2, priceAtSale: PRECO_VENDA, priceAtCost: PRECO_CUSTO, soldByWeight: false }
      ],
      itemsTotal: 50,
      shippingCost: 5,
      total: 55,
      deliveryType: 'delivery',
      address: 'Rua das Flores, 100',
      status: 'delivered',
      createdAt: agora,
      scheduledDate: agora,
      ...overrides
    };
  }

  const agendaSemanal: AgendaDeRecorrencia = { frequency: 'weekly', startDate: '2026-10-14' };

  // ---------- createFromOrder ----------

  describe('Regra: createFromOrder - criacao do modelo (CRÍTICA)', () => {
    it('[RED] should gravar modelo com companyId da sessao, status active, generateFrom = startDate e sem precos', async () => {
      const id = await service.createFromOrder(pedidoDeOrigem({ id: 'ped-origem-1' }), agendaSemanal);

      expect(typeof id).toBe('string', 'createFromOrder devolve o id do modelo');
      const modelo = await lerModelo(id);
      expect(modelo).toBeDefined('Modelo deve ser gravado em recurringOrders');
      expect(modelo['companyId']).toBe(companyId(), 'companyId vem da sessao');
      expect(modelo['status']).toBe('active');
      expect(modelo['frequency']).toBe('weekly');
      expect(modelo['startDate']).toBe('2026-10-14');
      expect(modelo['generateFrom']).toBe('2026-10-14', 'generateFrom = startDate na criacao');
      expect(modelo['items'].length).toBe(1);
      expect(modelo['items'][0].idProduct).toBe('prod-origem');
      expect(modelo['items'][0].priceAtSale).toBeUndefined('Modelo nao guarda preco do item');
      expect(modelo['items'][0].priceAtCost).toBeUndefined('Modelo nao guarda custo do item');
      expect(modelo['itemsTotal']).toBeUndefined('Modelo nao guarda total');
      expect(modelo['total']).toBeUndefined('Modelo nao guarda total');
      expect(modelo['sourceOrderId']).toBe('ped-origem-1', 'sourceOrderId gravado quando o pedido tem id');
    });

    it('[RED] should omitir sourceOrderId quando o pedido de origem nao tem id', async () => {
      const pedido = pedidoDeOrigem();
      delete pedido.id;

      const id = await service.createFromOrder(pedido, agendaSemanal);

      const modelo = await lerModelo(id);
      expect(modelo).toBeDefined();
      expect(modelo['sourceOrderId']).toBeUndefined('sourceOrderId so e gravado se o pedido tiver id');
    });

    it('[RED] should rejeitar agenda com weekdays vazio (DIAS_DA_SEMANA_INVALIDOS) sem gravar nada', async () => {
      const erro = await capturarErro(() => service.createFromOrder(pedidoDeOrigem(), {
        frequency: 'weekdays', startDate: '2026-10-14', weekdays: []
      }));

      expect(erro instanceof RecorrenciaInvalidaError).toBeTruthy('Deve lancar RecorrenciaInvalidaError');
      expect(erro?.codigo).toBe('DIAS_DA_SEMANA_INVALIDOS');
      expect(await contarModelos()).toBe(0, 'Agenda invalida nao pode gravar modelo');
    });

    it('[RED] should rejeitar endDate anterior ao startDate (FIM_ANTES_DO_INICIO) sem gravar nada', async () => {
      const erro = await capturarErro(() => service.createFromOrder(pedidoDeOrigem(), {
        frequency: 'weekly', startDate: '2026-10-14', endDate: '2026-10-07'
      }));

      expect(erro instanceof RecorrenciaInvalidaError).toBeTruthy('Deve lancar RecorrenciaInvalidaError');
      expect(erro?.codigo).toBe('FIM_ANTES_DO_INICIO');
      expect(await contarModelos()).toBe(0, 'Agenda invalida nao pode gravar modelo');
    });

    it('[RED] should rejeitar pedido sem itens (ITENS_INVALIDOS) sem gravar nada', async () => {
      const erro = await capturarErro(() => service.createFromOrder(pedidoDeOrigem({ items: [] }), agendaSemanal));

      expect(erro instanceof RecorrenciaInvalidaError).toBeTruthy('Deve lancar RecorrenciaInvalidaError');
      expect(erro?.codigo).toBe('ITENS_INVALIDOS');
      expect(await contarModelos()).toBe(0, 'Modelo sem itens nao pode ser gravado');
    });
  });

  // ---------- Leitura multi-tenant ----------

  describe('Regra: leitura so da empresa da sessao (CRÍTICA)', () => {
    it('[RED] should listar so modelos da empresa da sessao (modelo de outra empresa nao aparece)', async () => {
      const secondSetup = await setupSecondUserContext();
      try {
        const propria = await seedModelo('prod-leitura', { customerName: 'Minha empresa' });
        const estrangeiro = `rec-estrangeiro-${aleatorio()}`;
        await setDoc(doc(secondSetup.firestore, `recurringOrders/${estrangeiro}`), {
          companyId: secondSetup.mockCompanyId,
          status: 'active',
          frequency: 'weekly',
          startDate: '2026-10-14',
          generateFrom: '2026-10-14',
          customerName: 'Outra empresa',
          items: [],
          shippingCost: 0,
          deliveryType: 'pickup',
          createdAt: Timestamp.now()
        });

        const modelos = await firstValueFrom(service.getRecurringOrders());

        expect(modelos.some(m => m.id === propria)).toBeTruthy('Modelo da propria empresa deve aparecer');
        expect(modelos.some(m => m.id === estrangeiro)).toBeFalsy('Modelo de outra empresa NAO deve aparecer');
        expect(modelos.every(m => m.companyId === companyId())).toBeTruthy('Todos os modelos sao da sessao');
      } finally {
        await secondSetup.cleanup();
      }
    });

    it('[RED] should filtrar getByCustomer por customerId e por companyId da sessao', async () => {
      const secondSetup = await setupSecondUserContext();
      try {
        const doCliente = await seedModelo('prod-cliente', { customerId: 'cli-A' });
        await seedModelo('prod-cliente', { customerId: 'cli-B' });
        const estrangeiro = `rec-estrangeiro-cli-${aleatorio()}`;
        await setDoc(doc(secondSetup.firestore, `recurringOrders/${estrangeiro}`), {
          companyId: secondSetup.mockCompanyId,
          customerId: 'cli-A',
          status: 'active',
          frequency: 'weekly',
          startDate: '2026-10-14',
          generateFrom: '2026-10-14',
          customerName: 'Outra empresa',
          items: [],
          shippingCost: 0,
          deliveryType: 'pickup',
          createdAt: Timestamp.now()
        });

        const modelos = await firstValueFrom(service.getByCustomer('cli-A'));

        expect(modelos.map(m => m.id)).toEqual([doCliente], 'So o modelo do cliente A da propria empresa');
      } finally {
        await secondSetup.cleanup();
      }
    });
  });

  // ---------- generateOccurrence ----------

  describe('Regra: generateOccurrence - geracao idempotente de UMA ocorrencia (CRÍTICA)', () => {
    it('[RED] should criar pedido rec_{id}_{yyyyMMdd} pending com orderNumber do contador, precos atuais e cursor atualizado juntos', async () => {
      const produtoId = await seedProduto('feliz');
      await seedContador(7);
      const recId = await seedModelo(produtoId, { generatedCount: 0 });

      const resultado = await service.generateOccurrence(recId, DATA_OCORRENCIA, AGORA);

      expect(resultado).toBe('created');
      const pedido = await lerPedidoDaOcorrencia(recId);
      expect(pedido).toBeDefined('Pedido deve ser gravado com id rec_{id}_{yyyyMMdd}');
      expect(pedido['id']).toBe(`rec_${recId}_${SUFIXO_DATA_OCORRENCIA}`, 'Id do pedido gerado e deterministico');
      expect(pedido['status']).toBe('pending');
      expect(pedido['companyId']).toBe(companyId());
      expect(pedido['orderNumber']).toBe(7, 'orderNumber vem do counters/{companyId}');
      expect(pedido['recurringOrderId']).toBe(recId);
      expect(pedido['occurrenceDate']).toBe(DATA_OCORRENCIA);
      expect(pedido['items'][0].priceAtSale).toBe(PRECO_VENDA, 'Preco de venda atual do produto');
      expect(pedido['items'][0].priceAtCost).toBe(PRECO_CUSTO, 'Custo atual do produto');
      expect(pedido['itemsTotal']).toBe(50, 'itens = 2 x 25');
      expect(pedido['total']).toBe(55, 'total = itens + frete do modelo');
      expect(await lerContador()).toBe(8, 'Contador incrementa uma vez');
      const modelo = await lerModelo(recId);
      expect(modelo['lastGeneratedDate']).toBe(DATA_OCORRENCIA, 'Cursor avanca na mesma transacao');
      expect(modelo['generatedCount']).toBe(1, 'generatedCount incrementa na mesma transacao');
    });

    it('[RED] should devolver already-exists na 2a chamada da mesma data sem incrementar contador nem generatedCount', async () => {
      const produtoId = await seedProduto('dupla');
      await seedContador(7);
      const recId = await seedModelo(produtoId, { generatedCount: 0 });
      await service.generateOccurrence(recId, DATA_OCORRENCIA, AGORA);

      const segunda = await service.generateOccurrence(recId, DATA_OCORRENCIA, AGORA);

      expect(segunda).toBe('already-exists');
      expect(await lerContador()).toBe(8, 'Contador nao pode incrementar na 2a chamada');
      expect(await contarPedidosDoModelo(recId)).toBe(1, 'Exatamente um pedido para a data');
      const modelo = await lerModelo(recId);
      expect(modelo['generatedCount']).toBe(1, 'generatedCount nao muda na 2a chamada');
    });

    it('[RED] should gerar exatamente 1 pedido e +1 no contador quando duas chamadas concorrentes miram a mesma data', async () => {
      const produtoId = await seedProduto('concorrente');
      await seedContador(7);
      const recId = await seedModelo(produtoId, { generatedCount: 0 });

      const [a, b] = await Promise.all([
        service.generateOccurrence(recId, DATA_OCORRENCIA, AGORA),
        service.generateOccurrence(recId, DATA_OCORRENCIA, AGORA)
      ]);

      expect([a, b].sort()).toEqual(['already-exists', 'created'], 'Uma cria, a outra reconhece o existente');
      expect(await contarPedidosDoModelo(recId)).toBe(1, 'Exatamente 1 pedido gerado');
      expect(await lerContador()).toBe(8, 'Contador incrementa exatamente uma vez');
      expect((await lerModelo(recId))['generatedCount']).toBe(1);
    });

    it('[RED] should pular ocorrencia com produto excluido (skipped-issue): sem pedido, sem consumir orderNumber, cursor avanca e lastIssue gravado', async () => {
      await seedContador(7);
      const recId = await seedModelo('prod-excluido-inexistente', {
        items: [itemDoModelo('prod-excluido-inexistente', 2, 'Pao Frances')]
      });

      const resultado = await service.generateOccurrence(recId, DATA_OCORRENCIA, AGORA);

      expect(resultado).toBe('skipped-issue');
      expect(await lerPedidoDaOcorrencia(recId)).toBeUndefined('Nenhum pedido deve ser criado');
      expect(await contarPedidosDoModelo(recId)).toBe(0);
      expect(await lerContador()).toBe(7, 'orderNumber nao pode ser consumido por ocorrencia pulada');
      const modelo = await lerModelo(recId);
      expect(modelo['lastGeneratedDate']).toBe(DATA_OCORRENCIA, 'Cursor avanca mesmo pulando');
      expect(modelo['lastIssue']).toBeDefined('lastIssue deve ser gravado');
      expect(modelo['lastIssue'].date).toBe(DATA_OCORRENCIA);
      expect(modelo['lastIssue'].code).toBe('PRODUTO_INDISPONIVEL');
      expect(modelo['lastIssue'].detail).toContain('Pao Frances', 'detail cita o nome do produto');
    });

    it('[RED] should retornar not-due sem escrever nada quando o modelo esta paused', async () => {
      const produtoId = await seedProduto('pausado');
      await seedContador(7);
      const recId = await seedModelo(produtoId, { status: 'paused' });

      const resultado = await service.generateOccurrence(recId, DATA_OCORRENCIA, AGORA);

      expect(resultado).toBe('not-due');
      expect(await contarPedidosDoModelo(recId)).toBe(0);
      expect(await lerContador()).toBe(7, 'Contador intacto');
      const modelo = await lerModelo(recId);
      expect(modelo['lastGeneratedDate']).toBeUndefined('Cursor intacto');
      expect(modelo['status']).toBe('paused');
    });

    it('[RED] should retornar not-due sem escrever nada quando o modelo esta ended', async () => {
      const produtoId = await seedProduto('encerrado');
      await seedContador(7);
      const recId = await seedModelo(produtoId, { status: 'ended' });

      const resultado = await service.generateOccurrence(recId, DATA_OCORRENCIA, AGORA);

      expect(resultado).toBe('not-due');
      expect(await contarPedidosDoModelo(recId)).toBe(0);
      expect(await lerContador()).toBe(7, 'Contador intacto');
      expect((await lerModelo(recId))['lastGeneratedDate']).toBeUndefined('Cursor intacto');
    });

    it('[RED] should retornar not-due para data muito no futuro (fora da janela de antecedencia de 2 dias)', async () => {
      const produtoId = await seedProduto('futuro');
      await seedContador(7);
      const recId = await seedModelo(produtoId, { startDate: '2026-10-14', generateFrom: '2026-10-14' });

      // 2026-11-04 e ocorrencia semanal valida, mas esta muito alem de hoje + 2 dias
      const resultado = await service.generateOccurrence(recId, '2026-11-04', AGORA);

      expect(resultado).toBe('not-due');
      expect(await contarPedidosDoModelo(recId)).toBe(0);
      expect(await lerContador()).toBe(7);
      expect((await lerModelo(recId))['lastGeneratedDate']).toBeUndefined();
    });

    it('[RED] should retornar not-due para ocorrencia anterior ao catch-up (mais antiga que hoje - 3 dias)', async () => {
      const produtoId = await seedProduto('antiga');
      await seedContador(7);
      // startDate 2026-10-07 e semanal: 2026-10-14 e ocorrencia valida, mas hoje - 3 = 2026-10-18
      const recId = await seedModelo(produtoId, { startDate: '2026-10-07', generateFrom: '2026-10-07' });

      const resultado = await service.generateOccurrence(recId, '2026-10-14', AGORA);

      expect(resultado).toBe('not-due');
      expect(await contarPedidosDoModelo(recId)).toBe(0);
      expect(await lerContador()).toBe(7);
    });

    it('[RED] should marcar modelo como ended na mesma transacao quando a ocorrencia e a ultima antes do endDate', async () => {
      const produtoId = await seedProduto('ultima');
      await seedContador(7);
      // semanal: 10-14, 10-21 (esta), 10-28 (passa do endDate 10-21) -> sem proxima data
      const recId = await seedModelo(produtoId, { endDate: '2026-10-21', generatedCount: 0 });

      const resultado = await service.generateOccurrence(recId, DATA_OCORRENCIA, AGORA);

      expect(resultado).toBe('created');
      expect(await lerPedidoDaOcorrencia(recId)).toBeDefined('Ultima ocorrencia e gerada');
      const modelo = await lerModelo(recId);
      expect(modelo['status']).toBe('ended', 'Sem proxima data: modelo vira ended na mesma transacao');
      expect(modelo['lastGeneratedDate']).toBe(DATA_OCORRENCIA);
      expect(modelo['generatedCount']).toBe(1);
    });
  });

  // ---------- generateDueOccurrences ----------

  describe('Regra: generateDueOccurrences - janela e idempotencia em lote (CRÍTICA)', () => {
    it('[RED] should criar so as datas da janela (hoje-3..hoje+2) e retornar {criados, pulados}', async () => {
      const produtoId = await seedProduto('lote');
      await seedContador(1);
      // semanal desde 2026-10-07: 10-07, 10-14, 10-21, 10-28. Janela 10-18..10-23 -> so 10-21
      const recId = await seedModelo(produtoId, { startDate: '2026-10-07', generateFrom: '2026-10-07' });

      const resumo = await service.generateDueOccurrences(AGORA);

      expect(resumo).toEqual({ criados: 1, pulados: 0 });
      expect(await lerPedidoDaOcorrencia(recId, '20261021')).toBeDefined('10-21 esta na janela');
      expect(await lerPedidoDaOcorrencia(recId, '20261014')).toBeUndefined('10-14 e anterior ao catch-up');
      expect(await lerPedidoDaOcorrencia(recId, '20261028')).toBeUndefined('10-28 esta alem de hoje + 2');
    });

    it('[RED] should cobrir a janela inteira com agenda diaria: 6 datas de 10-18 a 10-23, nada antes de 10-18', async () => {
      const produtoId = await seedProduto('diario');
      await seedContador(1);
      const recId = await seedModelo(produtoId, {
        frequency: 'weekdays',
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        startDate: '2026-10-15',
        generateFrom: '2026-10-15'
      });

      const resumo = await service.generateDueOccurrences(AGORA);

      expect(resumo).toEqual({ criados: 6, pulados: 0 });
      expect(await lerPedidoDaOcorrencia(recId, '20261017')).toBeUndefined('10-17 esta antes de hoje - 3');
      expect(await lerPedidoDaOcorrencia(recId, '20261018')).toBeDefined('Limite inferior hoje - 3 incluso');
      expect(await lerPedidoDaOcorrencia(recId, '20261023')).toBeDefined('Limite superior hoje + 2 incluso');
      expect(await lerPedidoDaOcorrencia(recId, '20261024')).toBeUndefined('10-24 esta depois de hoje + 2');
      expect((await lerModelo(recId))['lastGeneratedDate']).toBe('2026-10-23');
      expect((await lerModelo(recId))['generatedCount']).toBe(6);
    });

    it('[RED] should nao duplicar na 2a execucao: segunda rodada retorna criados 0', async () => {
      const produtoId = await seedProduto('idempotente');
      await seedContador(1);
      await seedModelo(produtoId, { startDate: '2026-10-07', generateFrom: '2026-10-07' });

      const primeira = await service.generateDueOccurrences(AGORA);
      const segunda = await service.generateDueOccurrences(AGORA);

      expect(primeira).toEqual({ criados: 1, pulados: 0 });
      expect(segunda.criados).toBe(0, 'Nenhum pedido novo na 2a rodada');
    });

    it('[RED] should ignorar modelos paused na geracao em lote', async () => {
      const produtoId = await seedProduto('lote-pausado');
      await seedContador(1);
      const ativoId = await seedModelo(produtoId, { startDate: '2026-10-07', generateFrom: '2026-10-07' });
      const pausadoId = await seedModelo(produtoId, {
        status: 'paused', startDate: '2026-10-07', generateFrom: '2026-10-07'
      });

      const resumo = await service.generateDueOccurrences(AGORA);

      expect(resumo.criados).toBe(1, 'So o modelo ativo gera');
      expect(await contarPedidosDoModelo(pausadoId)).toBe(0, 'Modelo paused nao gera no lote');
      expect(await contarPedidosDoModelo(ativoId)).toBe(1);
    });
  });

  // ---------- pause / resume / end ----------

  describe('Regra: maquina de estado do modelo (CRÍTICA)', () => {
    it('[RED] should pausar modelo active gravando status paused e mantendo generateFrom', async () => {
      const produtoId = await seedProduto('pausa');
      const recId = await seedModelo(produtoId, { status: 'active', generateFrom: '2026-10-14' });

      await service.pause(recId);

      const modelo = await lerModelo(recId);
      expect(modelo['status']).toBe('paused');
      expect(modelo['generateFrom']).toBe('2026-10-14', 'Pausa nao altera o cursor de inicio');
    });

    it('[RED] should retomar modelo paused com status active e generateFrom = hoje (nunca gera o periodo pausado)', async () => {
      const produtoId = await seedProduto('retoma');
      const recId = await seedModelo(produtoId, { status: 'paused', generateFrom: '2026-09-01' });

      await service.resume(recId, AGORA);

      const modelo = await lerModelo(recId);
      expect(modelo['status']).toBe('active');
      expect(modelo['generateFrom']).toBe(DATA_OCORRENCIA, 'generateFrom = hoje(agora) no resume');
    });

    it('[RED] should encerrar modelo gravando status ended', async () => {
      const produtoId = await seedProduto('encerra');
      const recId = await seedModelo(produtoId, { status: 'active' });

      await service.end(recId);

      expect((await lerModelo(recId))['status']).toBe('ended');
    });

    it('[RED] should rejeitar resume de modelo ended e manter status ended e generateFrom', async () => {
      const produtoId = await seedProduto('reabre');
      const recId = await seedModelo(produtoId, { status: 'ended', generateFrom: '2026-10-14' });

      const erro = await capturarErro(() => service.resume(recId, AGORA));

      expect(erro).toBeDefined('Encerrado nao reabre');
      expect(erro?.message).not.toBe('NotImplemented', 'A rejeicao deve vir da regra, nao do stub');
      const modelo = await lerModelo(recId);
      expect(modelo['status']).toBe('ended');
      expect(modelo['generateFrom']).toBe('2026-10-14', 'generateFrom nao pode mudar');
    });
  });

  // ---------- update ----------

  describe('Regra: update do modelo (campos permitidos e encerrado bloqueia)', () => {
    it('[RED] should alterar campos permitidos (shippingCost, observations) e manter os demais', async () => {
      const produtoId = await seedProduto('edita');
      const recId = await seedModelo(produtoId, { status: 'active', shippingCost: 5, customerName: 'Mantido' });

      await service.update(recId, { shippingCost: 12, observations: 'Sem cebola' });

      const modelo = await lerModelo(recId);
      expect(modelo['shippingCost']).toBe(12);
      expect(modelo['observations']).toBe('Sem cebola');
      expect(modelo['customerName']).toBe('Mantido', 'Campo nao alterado permanece');
      expect(modelo['status']).toBe('active');
    });

    it('[RED] should rejeitar update de modelo ended sem alterar nada', async () => {
      const produtoId = await seedProduto('edita-ended');
      const recId = await seedModelo(produtoId, { status: 'ended', shippingCost: 5 });

      const erro = await capturarErro(() => service.update(recId, { shippingCost: 99 }));

      expect(erro).toBeDefined('Modelo encerrado nao e editavel');
      expect(erro?.message).not.toBe('NotImplemented', 'A rejeicao deve vir da regra, nao do stub');
      expect((await lerModelo(recId))['shippingCost']).toBe(5, 'Frete nao pode ser gravado');
    });
  });

  // ---------- Encerramento automatico fora da geracao (TASK-065, decisao 1) ----------

  describe('Regra: encerramento automatico fora da geracao (CRÍTICA)', () => {
    it('[RED] should encerrar modelo pausado retomado depois do endDate, na proxima geracao em lote', async () => {
      const produtoId = await seedProduto('enc-pausado');
      await seedContador(1);
      const recId = await seedModelo(produtoId, {
        status: 'paused', startDate: '2026-10-07', generateFrom: '2026-10-07', endDate: '2026-10-15'
      });
      await service.resume(recId, AGORA);

      const resumo = await service.generateDueOccurrences(AGORA);

      expect(resumo.criados).toBe(0, 'Nenhuma data existe depois do endDate');
      expect(await contarPedidosDoModelo(recId)).toBe(0);
      expect((await lerModelo(recId))['status']).toBe('ended', 'Sem proxima data valida o modelo encerra na geracao');
    });

    it('[RED] should encerrar modelo com catch-up esgotado (endDate em hoje-10..hoje-4) sem criar pedido', async () => {
      const produtoId = await seedProduto('enc-catchup');
      await seedContador(1);
      // semanal 10-07; ultima gerada 10-07; proxima seria 10-14, mas endDate 10-13 (hoje - 8) e o catch-up nao alcanca
      const recId = await seedModelo(produtoId, {
        startDate: '2026-10-07',
        generateFrom: '2026-10-07',
        lastGeneratedDate: '2026-10-07',
        generatedCount: 1,
        endDate: '2026-10-13'
      });

      const resumo = await service.generateDueOccurrences(AGORA);

      expect(resumo.criados).toBe(0, 'Catch-up nao gera nada');
      expect(await contarPedidosDoModelo(recId)).toBe(0, 'Nenhum pedido criado');
      expect((await lerModelo(recId))['status']).toBe('ended', 'Agenda esgotada encerra mesmo sem gerar');
    });

    it('[RED] should encerrar no proximo generateDueOccurrences quando update recua endDate para antes do cursor', async () => {
      const produtoId = await seedProduto('enc-update');
      await seedContador(1);
      const recId = await seedModelo(produtoId, {
        startDate: '2026-10-07',
        generateFrom: '2026-10-07',
        lastGeneratedDate: '2026-10-14',
        generatedCount: 1
      });

      await service.update(recId, { endDate: '2026-10-10' });
      const resumo = await service.generateDueOccurrences(AGORA);

      expect(resumo.criados).toBe(0);
      expect(await contarPedidosDoModelo(recId)).toBe(0, 'Data 10-21 esta depois do novo endDate');
      expect((await lerModelo(recId))['status']).toBe('ended');
    });

    it('[RED] should manter active modelo com proxima data futura valida dentro do endDate', async () => {
      const produtoId = await seedProduto('enc-futuro');
      await seedContador(1);
      const recId = await seedModelo(produtoId, {
        startDate: '2026-10-07', generateFrom: '2026-10-07', endDate: '2026-12-31'
      });

      const resumo = await service.generateDueOccurrences(AGORA);

      expect(resumo.criados).toBe(1, 'Ocorrencia de 10-21 gerada');
      expect((await lerModelo(recId))['status']).toBe('active', 'Ainda ha datas futuras: nao encerra');
    });

    it('[RED] should encerrar modelo semanal com cursor 10-07 e endDate 10-15 quando hoje e 10-21, sem criar pedido', async () => {
      const produtoId = await seedProduto('enc-esgotada-hoje');
      await seedContador(1);
      const recId = await seedModelo(produtoId, {
        startDate: '2026-10-07',
        generateFrom: '2026-10-07',
        lastGeneratedDate: '2026-10-07',
        generatedCount: 1,
        endDate: '2026-10-15'
      });

      const resumo = await service.generateDueOccurrences(AGORA);

      expect(resumo.criados).toBe(0, 'Nenhuma ocorrencia entre 10-08 e o endDate 10-15');
      expect(await contarPedidosDoModelo(recId)).toBe(0, 'Nenhum pedido criado');
      expect((await lerModelo(recId))['status']).toBe('ended', 'Agenda esgotada encerra no lote');
    });
  });

  // ---------- Falha isolada por modelo (TASK-065, decisao 2) ----------

  describe('Regra: falha de um modelo nao impede os demais e aparece em falhas (CRÍTICA)', () => {
    it('[RED] should gerar o modelo valido mesmo com outro modelo quebrado e listar o quebrado em falhas', async () => {
      const produtoId = await seedProduto('falha-isolada');
      await seedContador(1);
      // frequency fora do enum faz o calculo de datas lancar: o modelo quebra sozinho
      const quebradoId = await seedModelo(produtoId, {
        frequency: 'quinzenal', startDate: '2026-10-07', generateFrom: '2026-10-07'
      });
      const validoId = await seedModelo(produtoId, { startDate: '2026-10-07', generateFrom: '2026-10-07' });

      const resumo = await service.generateDueOccurrences(AGORA) as ResumoDaGeracao & { falhas?: string[] };

      expect(resumo.criados).toBe(1, 'Modelo valido gera a ocorrencia de 10-21');
      expect(await lerPedidoDaOcorrencia(validoId)).toBeDefined('Pedido do modelo valido gravado');
      expect(resumo.falhas).toEqual([quebradoId], 'Id do modelo que falhou aparece em falhas');
    });
  });

  // ---------- resume so vale para paused (TASK-065, decisao 3) ----------

  describe('Regra: resume so vale para modelo paused (CRÍTICA)', () => {
    it('[RED] should rejeitar resume de modelo active com erro de regra e sem alterar generateFrom', async () => {
      const produtoId = await seedProduto('resume-active');
      const recId = await seedModelo(produtoId, { status: 'active', generateFrom: '2026-10-14' });

      const erro = await capturarErro(() => service.resume(recId, AGORA));

      expect(erro).toBeDefined('Resume de modelo active deve ser rejeitado');
      expect(erro?.message).not.toBe('NotImplemented', 'A rejeicao deve vir da regra, nao do stub');
      const modelo = await lerModelo(recId);
      expect(modelo['status']).toBe('active');
      expect(modelo['generateFrom']).toBe('2026-10-14', 'generateFrom nao pode mudar em resume rejeitado');
    });
  });
});
