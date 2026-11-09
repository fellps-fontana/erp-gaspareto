import { TestBed } from '@angular/core/testing';
import { Firestore, Timestamp } from '@angular/fire/firestore';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { firstValueFrom } from 'rxjs';
import { SubscriptionService } from './subscription-service';
import { GeracaoParcialError, MensalidadeInvalidaError } from './subscription-rules';
import { SubscriptionConfigInput } from '../../models/subscription-model';
import { hojeCivil } from '../recurring-order-service/recurrence-rules';
import {
  EmulatorTestContext, EmulatorTestSetup, setupFirestoreEmulatorTest, setupSecondUserContext
} from '../test-helpers';

const HOJE = '2026-11-09';
const VALOR = 150;
const EMULADOR = 'http://127.0.0.1:8080';
const BASE_DOCUMENTOS = `${EMULADOR}/v1/projects/demo-test/databases/(default)/documents`;
// Bypass oficial do emulador: ignora as rules. Usado so para promover o super-admin
// (o cliente nao pode gravar isSuperAdmin) e para limpar as colecoes entre os testes.
const BYPASS_DAS_REGRAS = { Authorization: 'Bearer owner' };

async function promoverASuperAdmin(uid: string): Promise<void> {
  const resposta = await fetch(`${BASE_DOCUMENTOS}/users/${uid}?updateMask.fieldPaths=isSuperAdmin`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...BYPASS_DAS_REGRAS },
    body: JSON.stringify({ fields: { isSuperAdmin: { booleanValue: true } } })
  });
  if (!resposta.ok) {
    throw new Error(`Falha ao promover super-admin no emulador: HTTP ${resposta.status}`);
  }
}

async function limparColecoesDeMensalidade(): Promise<void> {
  for (const colecao of ['subscriptions', 'subscriptionCharges']) {
    const resposta = await fetch(`${BASE_DOCUMENTOS}/${colecao}?pageSize=300`, {
      headers: BYPASS_DAS_REGRAS
    });
    if (!resposta.ok) {
      throw new Error(`Falha ao listar ${colecao} no emulador: HTTP ${resposta.status}`);
    }
    const corpo = await resposta.json();
    for (const documento of corpo.documents ?? []) {
      await fetch(`${EMULADOR}/v1/${documento.name}`, { method: 'DELETE', headers: BYPASS_DAS_REGRAS });
    }
  }
}

// Config sem contractStart (corrompida). Gravada por REST com bypass, porque o cliente nao deixa gravar isso.
async function gravarConfigCorrompidaViaRest(companyId: string): Promise<void> {
  const resposta = await fetch(`${BASE_DOCUMENTOS}/subscriptions/${companyId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...BYPASS_DAS_REGRAS },
    body: JSON.stringify({
      fields: {
        companyId: { stringValue: companyId },
        amount: { doubleValue: VALOR },
        dueDay: { integerValue: '10' },
        active: { booleanValue: true },
        generateFrom: { stringValue: '2026-11' }
      }
    })
  });
  if (!resposta.ok) {
    throw new Error(`Falha ao gravar config corrompida no emulador: HTTP ${resposta.status}`);
  }
}

// Config ativa sem o campo companyId (corrompida). Gravada por REST com bypass, como a anterior.
async function gravarConfigAtivaSemCompanyIdViaRest(docId: string): Promise<void> {
  const resposta = await fetch(`${BASE_DOCUMENTOS}/subscriptions/${docId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...BYPASS_DAS_REGRAS },
    body: JSON.stringify({
      fields: {
        amount: { doubleValue: VALOR },
        dueDay: { integerValue: '10' },
        active: { booleanValue: true },
        contractStart: { stringValue: '2026-11-01' },
        generateFrom: { stringValue: '2026-11' }
      }
    })
  });
  if (!resposta.ok) {
    throw new Error(`Falha ao gravar config sem companyId no emulador: HTTP ${resposta.status}`);
  }
}

async function capturarErro(operacao: () => unknown): Promise<any> {
  try {
    await operacao();
  } catch (erro) {
    return erro;
  }
  return undefined;
}

// Codigo da regra (MensalidadeInvalidaError.codigo ou code do Firestore). Qualquer outro erro
// vira 'OUTRO_ERRO: <mensagem>', assim o RED mostra a causa real (ex: NOT_IMPLEMENTED).
function descreverErro(erro: any): string | null {
  if (erro === undefined) {
    return null;
  }
  if (erro instanceof MensalidadeInvalidaError) {
    return erro.codigo;
  }
  if (typeof erro?.code === 'string') {
    return erro.code;
  }
  return `OUTRO_ERRO: ${erro?.message}`;
}

function servicoCom(firestore: Firestore): SubscriptionService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      SubscriptionService,
      { provide: Firestore, useValue: firestore }
    ]
  });
  return TestBed.inject(SubscriptionService);
}

describe('SubscriptionService - Mensalidade da plataforma (CRÍTICA)', () => {
  let superAdmin: EmulatorTestSetup;
  let empresaA: EmulatorTestContext;
  let empresaB: EmulatorTestContext;
  let idA: string;
  let idB: string;
  let service: SubscriptionService;

  beforeEach(async () => {
    await limparColecoesDeMensalidade();

    // Super-admin: usuario sem empresa propria, promovido por REST (bypass).
    superAdmin = await setupFirestoreEmulatorTest(null);
    await promoverASuperAdmin(superAdmin.auth.currentUser!.uid);

    // Duas empresas, cada uma com seu owner autenticado (companyId = uid do owner).
    empresaA = await setupSecondUserContext();
    empresaB = await setupSecondUserContext();
    idA = empresaA.mockCompanyId as string;
    idB = empresaB.mockCompanyId as string;

    service = servicoCom(superAdmin.firestore);
  });

  afterEach(async () => {
    await superAdmin?.cleanup();
    await empresaA?.cleanup();
    await empresaB?.cleanup();
  });

  // ---------- Helpers (seed direto no emulador como super-admin; o service so e exercitado nas chamadas) ----------

  async function seedConfig(companyId: string, overrides: Record<string, unknown> = {}): Promise<void> {
    await setDoc(doc(superAdmin.firestore, `subscriptions/${companyId}`), {
      companyId,
      amount: VALOR,
      dueDay: 10,
      active: true,
      contractStart: '2026-11-01',
      generateFrom: '2026-11',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      ...overrides
    });
  }

  async function seedCobranca(companyId: string, competence: string, dueDate = `${competence}-10`): Promise<string> {
    const id = `${companyId}_${competence.replace('-', '')}`;
    await setDoc(doc(superAdmin.firestore, `subscriptionCharges/${id}`), {
      companyId,
      competence,
      dueDate,
      amount: VALOR,
      status: 'a_pagar',
      paidDate: null,
      paidAmount: null,
      createdAt: Timestamp.now()
    });
    return id;
  }

  // Rules so aceitam criar como a_pagar; a cobranca paga e chegada por update legitimo (a_pagar -> pago).
  async function marcarPagaDireto(id: string, dataPagamento: string): Promise<void> {
    await updateDoc(doc(superAdmin.firestore, `subscriptionCharges/${id}`), {
      status: 'pago',
      paidDate: dataPagamento,
      paidAmount: VALOR
    });
  }

  async function lerConfig(companyId: string): Promise<any> {
    const snap = await getDoc(doc(superAdmin.firestore, `subscriptions/${companyId}`));
    return snap.data();
  }

  async function lerCobranca(id: string): Promise<any> {
    const snap = await getDoc(doc(superAdmin.firestore, `subscriptionCharges/${id}`));
    return snap.data();
  }

  async function idsDasCobrancasDaEmpresa(companyId: string): Promise<string[]> {
    const snap = await getDocs(query(
      collection(superAdmin.firestore, 'subscriptionCharges'),
      where('companyId', '==', companyId)
    ));
    return snap.docs.map(d => d.id).sort();
  }

  function servicoDaEmpresa(ctx: EmulatorTestContext): SubscriptionService {
    return servicoCom(ctx.firestore);
  }

  // ---------- generateDueCharges(hoje) ----------

  describe('Regra: generateDueCharges - geracao automatica e idempotente (CRÍTICA)', () => {

    it('should criar cobrancas so para empresas com active = true (empresa inativa nao gera)', async () => {
      await seedConfig(idA, { active: true, contractStart: '2026-11-01', generateFrom: '2026-11', dueDay: 10 });
      await seedConfig(idB, { active: false, contractStart: '2026-11-01', generateFrom: '2026-11', dueDay: 10 });

      const criadas = await service.generateDueCharges(HOJE);

      expect(criadas).toBe(1, 'So a empresa ativa gera uma cobranca');
      expect(await idsDasCobrancasDaEmpresa(idA)).toEqual([`${idA}_202611`]);
      expect(await idsDasCobrancasDaEmpresa(idB)).toEqual([], 'Empresa inativa nao recebe cobranca');
    });

    it('should nao duplicar: 2 execucoes seguidas deixam a mesma contagem e a 2a devolve 0', async () => {
      // contrato desde 2026-08: 08, 09, 10 e 11 ja estao no passado ou no mes atual
      await seedConfig(idA, { contractStart: '2026-08-01', generateFrom: '2026-08', dueDay: 10 });

      const primeira = await service.generateDueCharges(HOJE);
      const idsAposPrimeira = await idsDasCobrancasDaEmpresa(idA);
      const segunda = await service.generateDueCharges(HOJE);

      expect(primeira).toBe(4, 'Catch-up gera 08, 09, 10 e 11 na 1a execucao');
      expect(idsAposPrimeira.length).toBe(4);
      expect(segunda).toBe(0, 'Nenhuma cobranca nova na 2a execucao');
      expect(await idsDasCobrancasDaEmpresa(idA)).toEqual(idsAposPrimeira, 'Mesmos docs, nenhum duplicado');
    });

    it('should gerar exatamente uma cobranca por mes quando duas execucoes concorrentes rodam juntas', async () => {
      await seedConfig(idA, { contractStart: '2026-10-01', generateFrom: '2026-10', dueDay: 10 });

      const [a, b] = await Promise.all([
        service.generateDueCharges(HOJE),
        service.generateDueCharges(HOJE)
      ]);

      expect(a + b).toBe(2, 'Somadas, criam exatamente 2 cobrancas (10 e 11)');
      expect(await idsDasCobrancasDaEmpresa(idA)).toEqual([`${idA}_202610`, `${idA}_202611`]);
    });

    it('should criar a primeira cobranca no mes do contractStart mesmo com dueDay ja passado nesse mes', async () => {
      await seedConfig(idA, { contractStart: '2026-11-15', generateFrom: '2026-11', dueDay: 3 });

      await service.generateDueCharges('2026-11-20');

      expect(await idsDasCobrancasDaEmpresa(idA)).toEqual([`${idA}_202611`]);
      const cobranca = await lerCobranca(`${idA}_202611`);
      expect(cobranca['dueDate']).toBe('2026-11-03', 'Vencimento ja passado nasce em atraso');
      expect(cobranca['status']).toBe('a_pagar');
    });

    it('should nunca gerar antes do mes do contractStart, mesmo com generateFrom anterior', async () => {
      await seedConfig(idA, { contractStart: '2026-11-15', generateFrom: '2026-01', dueDay: 3 });

      await service.generateDueCharges('2026-11-20');

      expect(await idsDasCobrancasDaEmpresa(idA)).toEqual([`${idA}_202611`],
        'Nenhuma competencia de 2026-01 a 2026-10 pode existir');
    });

    it('should antecipar a competencia seguinte so dentro da janela de 5 dias', async () => {
      // dueDay 3 -> competencia 2026-12 vence em 2026-12-03; janela abre em 2026-11-28
      await seedConfig(idA, { contractStart: '2026-11-01', generateFrom: '2026-11', dueDay: 3 });

      const primeira = await service.generateDueCharges('2026-11-27');
      expect(primeira).toBe(1, 'Um dia antes da janela so 2026-11 e gerada');
      expect(await idsDasCobrancasDaEmpresa(idA)).toEqual([`${idA}_202611`]);

      const segunda = await service.generateDueCharges('2026-11-28');
      expect(segunda).toBe(1, 'Na janela, 2026-12 entra');
      expect(await idsDasCobrancasDaEmpresa(idA)).toEqual([`${idA}_202611`, `${idA}_202612`]);
    });

    it('should retornar a quantidade criada somando todas as empresas ativas', async () => {
      await seedConfig(idA, { contractStart: '2026-11-01', generateFrom: '2026-11', dueDay: 10 });
      await seedConfig(idB, { contractStart: '2026-11-01', generateFrom: '2026-11', dueDay: 10 });

      expect(await service.generateDueCharges(HOJE)).toBe(2);
    });

    it('should gravar doc com id {companyId}_{yyyyMM} e snapshot de amount e dueDate calculada', async () => {
      await seedConfig(idA, { amount: 180, contractStart: '2026-11-01', generateFrom: '2026-11', dueDay: 31 });

      await service.generateDueCharges(HOJE);

      const cobranca = await lerCobranca(`${idA}_202611`);
      expect(cobranca).toBeDefined('Id deterministico {companyId}_{yyyyMM}');
      expect(cobranca['companyId']).toBe(idA);
      expect(cobranca['competence']).toBe('2026-11');
      expect(cobranca['dueDate']).toBe('2026-11-30', 'Dia 31 em novembro cai em 30');
      expect(cobranca['amount']).toBe(180, 'Snapshot do valor da config na geracao');
      expect(cobranca['status']).toBe('a_pagar');
      expect(cobranca['paidDate']).toBeNull();
      expect(cobranca['paidAmount']).toBeNull();
    });
  });

  describe('Regra: generateDueCharges - falha parcial nao interrompe as demais empresas (CRÍTICA)', () => {

    const ID_CORROMPIDA = 'empresa-corrompida';

    it('lanca GeracaoParcialError e grava as cobrancas das empresas validas quando uma config esta corrompida', async () => {
      await seedConfig(idA, { contractStart: '2026-11-01', generateFrom: '2026-11', dueDay: 10 });
      await seedConfig(idB, { contractStart: '2026-11-01', generateFrom: '2026-11', dueDay: 10 });
      await gravarConfigCorrompidaViaRest(ID_CORROMPIDA);

      const erro = await capturarErro(() => service.generateDueCharges(HOJE));

      expect(erro instanceof GeracaoParcialError).toBe(true, 'Falha parcial deve lancar GeracaoParcialError');
      expect(erro?.criadas).toBe(2, 'Uma cobranca para cada empresa valida');
      expect(erro?.empresasComFalha).toEqual([ID_CORROMPIDA]);
      expect(await idsDasCobrancasDaEmpresa(idA)).toEqual([`${idA}_202611`]);
      expect(await idsDasCobrancasDaEmpresa(idB)).toEqual([`${idB}_202611`]);
      expect(await idsDasCobrancasDaEmpresa(ID_CORROMPIDA)).toEqual([], 'Config corrompida nao gera cobranca');
    });

    it('identifica a empresa com falha pelo id do doc quando a config ativa nao tem companyId', async () => {
      const ID_SEM_COMPANY_ID = 'empresa-sem-id';
      await seedConfig(idA, { contractStart: '2026-11-01', generateFrom: '2026-11', dueDay: 10 });
      await gravarConfigAtivaSemCompanyIdViaRest(ID_SEM_COMPANY_ID);

      const erro = await capturarErro(() => service.generateDueCharges(HOJE));

      expect(erro instanceof GeracaoParcialError).toBe(true, 'Falha parcial deve lancar GeracaoParcialError');
      expect(erro?.empresasComFalha).toEqual([ID_SEM_COMPANY_ID], 'A falha deve ser atribuida ao id do doc, nao a undefined');
      expect(await idsDasCobrancasDaEmpresa(idA)).toEqual([`${idA}_202611`], 'Empresa valida segue com a cobranca gravada');
      expect(await idsDasCobrancasDaEmpresa(ID_SEM_COMPANY_ID)).toEqual([], 'Config sem companyId nao gera cobranca');
    });
  });

  // ---------- saveConfig ----------

  describe('Regra: saveConfig - validacao e generateFrom (CRÍTICA)', () => {

    const entradaValida: SubscriptionConfigInput = {
      amount: VALOR, dueDay: 10, active: true, contractStart: '2026-03-15'
    };

    const casosInvalidos: [string, Partial<SubscriptionConfigInput>, string][] = [
      ['amount 0', { amount: 0 }, 'VALOR_INVALIDO'],
      ['amount 120.555 (3 casas decimais)', { amount: 120.555 }, 'VALOR_INVALIDO'],
      ['dueDay 32', { dueDay: 32 }, 'DIA_VENCIMENTO_INVALIDO'],
      ['contractStart 2026-02-30 (inexistente)', { contractStart: '2026-02-30' }, 'INICIO_INVALIDO']
    ];

    casosInvalidos.forEach(([descricao, alteracao, codigo]) => {
      it(`should lancar MensalidadeInvalidaError ${codigo} para ${descricao} sem gravar config`, async () => {
        const erro = await capturarErro(() =>
          service.saveConfig(idA, { ...entradaValida, ...alteracao }, HOJE));

        expect(erro instanceof MensalidadeInvalidaError).toBe(true, 'Deve lancar MensalidadeInvalidaError');
        expect(descreverErro(erro)).toBe(codigo);
        expect(await lerConfig(idA)).toBeUndefined('Config invalida nao pode ser gravada');
      });
    });

    it('should gravar generateFrom = mes do contractStart no primeiro save', async () => {
      await service.saveConfig(idA, entradaValida, HOJE);

      const config = await lerConfig(idA);
      expect(config).toBeDefined();
      expect(config['companyId']).toBe(idA);
      expect(config['generateFrom']).toBe('2026-03', 'Primeiro save: generateFrom = mes de contractStart');
      expect(config['amount']).toBe(VALOR);
      expect(config['active']).toBe(true);
    });

    it('should gravar generateFrom = mes atual ao reativar (active false -> true)', async () => {
      await seedConfig(idA, { active: false, contractStart: '2026-03-15', generateFrom: '2026-03' });

      await service.saveConfig(idA, { ...entradaValida, active: true }, HOJE);

      expect((await lerConfig(idA))['generateFrom']).toBe('2026-11', 'Reativar: generateFrom = mes de hoje');
    });

    it('should manter generateFrom ao salvar sem reativar (active true -> true)', async () => {
      await seedConfig(idA, { active: true, contractStart: '2026-03-15', generateFrom: '2026-03' });

      await service.saveConfig(idA, { ...entradaValida, amount: 200 }, HOJE);

      expect((await lerConfig(idA))['generateFrom']).toBe('2026-03', 'Sem reativacao o cursor nao muda');
    });

    it('should nao alterar cobrancas ja geradas ao editar amount da config', async () => {
      await seedConfig(idA, { amount: VALOR, contractStart: '2026-11-01', generateFrom: '2026-11', dueDay: 10 });
      const id = await seedCobranca(idA, '2026-11', '2026-11-10');

      await service.saveConfig(idA, { ...entradaValida, amount: 200, contractStart: '2026-11-01' }, HOJE);

      expect((await lerConfig(idA))['amount']).toBe(200, 'Config passa a valer para geracoes futuras');
      expect((await lerCobranca(id))['amount']).toBe(VALOR, 'Cobranca ja gerada guarda o snapshot antigo');
    });
  });

  // ---------- markAsPaid ----------

  describe('Regra: markAsPaid - botao Recebi (CRÍTICA)', () => {

    it('should gravar paidDate e paidAmount = amount ao marcar como pago', async () => {
      const id = await seedCobranca(idA, '2026-11', '2026-11-10');

      await service.markAsPaid(id, '2026-11-09');

      const cobranca = await lerCobranca(id);
      expect(cobranca['status']).toBe('pago');
      expect(cobranca['paidDate']).toBe('2026-11-09');
      expect(cobranca['paidAmount']).toBe(VALOR, 'Sem pagamento parcial: paidAmount = amount');
      expect(cobranca['amount']).toBe(VALOR, 'amount nao muda');
    });

    it('should usar a data de hoje como paidDate quando nao informada', async () => {
      const id = await seedCobranca(idA, '2026-11', '2026-11-10');

      await service.markAsPaid(id);

      expect((await lerCobranca(id))['paidDate']).toBe(hojeCivil(new Date()));
    });

    it('should lancar JA_PAGA na segunda chamada sem alterar a data ja gravada', async () => {
      const id = await seedCobranca(idA, '2026-11', '2026-11-10');
      await service.markAsPaid(id, '2026-11-09');

      const erro = await capturarErro(() => service.markAsPaid(id, '2026-11-12'));

      expect(erro instanceof MensalidadeInvalidaError).toBe(true, 'Deve lancar MensalidadeInvalidaError');
      expect(descreverErro(erro)).toBe('JA_PAGA');
      expect((await lerCobranca(id))['paidDate']).toBe('2026-11-09', 'Data original preservada');
    });

    it('should lancar erro ao marcar cobranca inexistente sem criar documento', async () => {
      const id = `${idA}_209901`;

      const erro = await capturarErro(() => service.markAsPaid(id, '2026-11-09'));

      expect(erro).toBeDefined('Cobranca inexistente deve gerar erro');
      expect(erro?.message).not.toBe('NOT_IMPLEMENTED', 'A rejeicao deve vir da regra, nao do stub');
      expect(await lerCobranca(id)).toBeUndefined('Nao pode criar cobranca como efeito colateral');
    });

    it('lanca DATA_PAGAMENTO_INVALIDA para paidDate vazia e mantem a cobranca a_pagar', async () => {
      const id = await seedCobranca(idA, '2026-11', '2026-11-10');

      const erro = await capturarErro(() => service.markAsPaid(id, ''));

      expect(erro instanceof MensalidadeInvalidaError).toBe(true, 'Deve lancar MensalidadeInvalidaError');
      expect(descreverErro(erro)).toBe('DATA_PAGAMENTO_INVALIDA');
      expect((await lerCobranca(id))['status']).toBe('a_pagar', 'Data invalida nao pode marcar como paga');
    });

    it('lanca COBRANCA_NAO_ENCONTRADA para id inexistente', async () => {
      const erro = await capturarErro(() => service.markAsPaid(`${idA}_209901`, '2026-11-09'));

      expect(erro instanceof MensalidadeInvalidaError).toBe(true, 'Deve lancar MensalidadeInvalidaError');
      expect(descreverErro(erro)).toBe('COBRANCA_NAO_ENCONTRADA');
    });
  });

  // ---------- undoPayment ----------

  describe('Regra: undoPayment - desfazer Recebi por engano (CRÍTICA)', () => {

    it('should voltar pago para a_pagar limpando paidDate e paidAmount', async () => {
      const id = await seedCobranca(idA, '2026-11', '2026-11-10');
      await marcarPagaDireto(id, '2026-11-09');

      await service.undoPayment(id);

      const cobranca = await lerCobranca(id);
      expect(cobranca['status']).toBe('a_pagar');
      expect(cobranca['paidDate']).toBeNull();
      expect(cobranca['paidAmount']).toBeNull();
      expect(cobranca['amount']).toBe(VALOR, 'amount nao muda');
    });

    it('should lancar NAO_PAGA ao desfazer cobranca que nao esta paga', async () => {
      const id = await seedCobranca(idA, '2026-11', '2026-11-10');

      const erro = await capturarErro(() => service.undoPayment(id));

      expect(erro instanceof MensalidadeInvalidaError).toBe(true, 'Deve lancar MensalidadeInvalidaError');
      expect(descreverErro(erro)).toBe('NAO_PAGA');
      expect((await lerCobranca(id))['status']).toBe('a_pagar', 'Cobranca a_pagar permanece intacta');
    });

    it('lanca COBRANCA_NAO_ENCONTRADA ao desfazer cobranca inexistente sem criar documento', async () => {
      const id = `${idA}_209901`;

      const erro = await capturarErro(() => service.undoPayment(id));

      expect(erro instanceof MensalidadeInvalidaError).toBe(true, 'Deve lancar MensalidadeInvalidaError');
      expect(descreverErro(erro)).toBe('COBRANCA_NAO_ENCONTRADA');
      expect(await lerCobranca(id)).toBeUndefined('Nao pode criar cobranca como efeito colateral');
    });
  });

  // ---------- getOpenChargesOfCompany (isolamento entre empresas) ----------

  describe('Regra: getOpenChargesOfCompany - empresa so ve as proprias pendentes (CRÍTICA)', () => {

    beforeEach(async () => {
      await seedCobranca(idA, '2026-10', '2026-10-10');
      await marcarPagaDireto(`${idA}_202610`, '2026-10-08');
      await seedCobranca(idA, '2026-11', '2026-11-10');
      await seedCobranca(idB, '2026-11', '2026-11-10');
    });

    it('should devolver a empresa A so as proprias cobrancas a_pagar', async () => {
      const cobrancas = await firstValueFrom(servicoDaEmpresa(empresaA).getOpenChargesOfCompany(idA));

      expect(cobrancas.map(c => c.id)).toEqual([`${idA}_202611`]);
      expect(cobrancas.every(c => c.companyId === idA)).toBe(true, 'Nenhuma cobranca de outra empresa');
      expect(cobrancas.every(c => c.status === 'a_pagar')).toBe(true);
    });

    it('should nao devolver cobranca paga da propria empresa', async () => {
      const cobrancas = await firstValueFrom(servicoDaEmpresa(empresaA).getOpenChargesOfCompany(idA));

      expect(cobrancas.some(c => c.id === `${idA}_202610`)).toBe(false, 'Paga nao aparece como aberta');
    });

    it('should negar a empresa B a leitura das cobrancas da empresa A (permission-denied)', async () => {
      const erro = await capturarErro(() =>
        firstValueFrom(servicoDaEmpresa(empresaB).getOpenChargesOfCompany(idA)));

      expect(erro).toBeDefined('Empresa B nao pode listar cobrancas da A');
      expect(descreverErro(erro)).toBe('permission-denied', 'A rejeicao deve vir da rules, nao do stub');
    });
  });
});
