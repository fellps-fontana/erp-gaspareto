import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  DocumentData,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { firstValueFrom } from 'rxjs';
import { ExpenseRecurrenceService } from './expense-recurrence-service';
import { ExpenseScheduleService } from '../expense-schedule-service/expense-schedule-service';
import { TenantService } from '../tenant-service/tenant-service';
import { DateKey, ExpenseRecurrencePeriod, NewExpenseInput } from '../../models/expense-model';
import {
  EmulatorTestContext,
  EmulatorTestSetup,
  setupFirestoreEmulatorTest,
  setupSecondUserContext,
} from '../test-helpers';

interface OcorrenciaLida {
  id: string;
  companyId: string;
  seriesId?: string;
  dueDate: DateKey;
  origin: string;
  status: string;
  value: number;
  categoryId: string;
  description: string;
}

// Fixtures com id unico por execucao (nunca IDs fixos de documento).
function idUnico(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Serie semeada direto no Firestore (fixture), sem passar pelo service sob teste.
async function semearSerie(
  contexto: EmulatorTestContext,
  companyId: string,
  parcial: Record<string, unknown> = {},
): Promise<string> {
  const ref = await addDoc(collection(contexto.firestore, 'expenseSeries'), {
    companyId,
    active: true,
    period: 'mensal',
    anchorDate: '2026-01-31',
    template: {
      description: `Serie ${idUnico()}`,
      value: 99.9,
      categoryId: 'cat_serie',
    },
    createdAt: Timestamp.now(),
    ...parcial,
  });
  return ref.id;
}

// Leitura de serie existente (getDoc so em doc que existe).
async function lerSerie(
  contexto: EmulatorTestContext,
  id: string,
): Promise<DocumentData | undefined> {
  const snap = await getDoc(doc(contexto.firestore, 'expenseSeries', id));
  return snap.data();
}

// Existencia/contagem sem get() nem where(documentId()) de doc inexistente:
// as rules negam ambos quando o documento nao existe (resource nulo). Lista
// so as despesas da empresa informada e filtra pela serie em memoria.
async function ocorrenciasDaSerie(
  contexto: EmulatorTestContext,
  companyId: string,
  seriesId: string,
): Promise<OcorrenciaLida[]> {
  const snap = await getDocs(
    query(
      collection(contexto.firestore, 'expenses'),
      where('companyId', '==', companyId),
      where('seriesId', '==', seriesId),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OcorrenciaLida, 'id'>) }));
}

function datasDe(ocorrencias: OcorrenciaLida[]): DateKey[] {
  return ocorrencias.map((o) => o.dueDate).sort();
}

function novaSerieInput(
  categoriaId: string,
  parcial: Partial<NewExpenseInput> = {},
): NewExpenseInput {
  return {
    description: `Aluguel ${idUnico()}`,
    value: 150.5,
    categoryId: categoriaId,
    dueDate: '2026-03-15',
    ...parcial,
  };
}

// Categoria real da empresa (createSeries valida a categoria na escrita).
async function semearCategoria(
  contexto: EmulatorTestContext,
  companyId: string,
  parcial: Record<string, unknown> = {},
): Promise<string> {
  const ref = await addDoc(collection(contexto.firestore, 'expenseCategories'), {
    companyId,
    name: `Categoria ${idUnico()}`,
    type: 'despesa_operacional',
    archived: false,
    createdAt: Timestamp.now(),
    ...parcial,
  });
  return ref.id;
}

// Contagem por companyId: lista a colecao da empresa (sem get de doc inexistente).
async function contarDocs(
  contexto: EmulatorTestContext,
  colecao: string,
  companyId: string,
): Promise<number> {
  const snap = await getDocs(
    query(collection(contexto.firestore, colecao), where('companyId', '==', companyId)),
  );
  return snap.size;
}

// Rejeicao de createSeries que tambem prova que nada foi gravado (serie nem ocorrencia).
async function expectCriarSerieRejeitadaSemGravar(
  service: ExpenseRecurrenceService,
  contexto: EmulatorTestSetup,
  input: NewExpenseInput,
  period: ExpenseRecurrencePeriod,
): Promise<void> {
  await expectRejeicaoDeRegra(() => service.createSeries(input, period));
  const empresa = contexto.mockCompanyId as string;
  expect(await contarDocs(contexto, 'expenseSeries', empresa))
    .withContext('nenhuma serie gravada')
    .toBe(0);
  expect(await contarDocs(contexto, 'expenses', empresa))
    .withContext('nenhuma ocorrencia gravada')
    .toBe(0);
}

// Garante que chamadas sincronas que lancam viram rejeicao da promise.
function promessaDe(fn: () => Promise<unknown>): Promise<unknown> {
  return Promise.resolve().then(fn);
}

// Rejeicao que PROVA a regra: precisa lancar e o erro nao pode ser o do
// esqueleto ("not implemented"), senao o teste passa sem logica nenhuma.
async function expectRejeicaoDeRegra(fn: () => Promise<unknown>): Promise<void> {
  let lancou = false;
  let mensagem = '';
  try {
    await promessaDe(fn);
  } catch (erro) {
    lancou = true;
    mensagem = (erro as Error)?.message ?? '';
  }
  expect(lancou).withContext('a operacao deveria lancar').toBeTrue();
  expect(mensagem)
    .withContext('rejeicao vinda do esqueleto (not implemented) nao prova a regra')
    .not.toMatch(/not implemented/);
}

function configurarServico(contexto: EmulatorTestSetup): ExpenseRecurrenceService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      ExpenseRecurrenceService,
      { provide: TenantService, useValue: contexto.tenantService },
      { provide: Firestore, useValue: contexto.firestore },
    ],
  });
  return TestBed.inject(ExpenseRecurrenceService);
}

describe('ExpenseRecurrenceService - catch-up (REGRA CRITICA, emulador Firestore)', () => {
  let service: ExpenseRecurrenceService;
  let setup: EmulatorTestSetup;
  let categoriaId: string;

  beforeEach(async () => {
    setup = await setupFirestoreEmulatorTest();
    service = configurarServico(setup);
    categoriaId = await semearCategoria(setup, setup.mockCompanyId as string);
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  describe('Regra 7.3: catch-up gera TODAS as ocorrencias ate o fim do mes corrente (CRITICA)', () => {
    it('[RED] mensal com ancora dia 31 gera 31/01, 28/02, 31/03, 30/04 e 31/05 (calculo a partir da ancora)', async () => {
      const empresa = setup.mockCompanyId as string;
      const serieId = await semearSerie(setup, empresa, {
        anchorDate: '2026-01-31',
        period: 'mensal',
      });

      const resultado = await service.generateDueOccurrences(empresa, '2026-05-10');
      const ocorrencias = await ocorrenciasDaSerie(setup, empresa, serieId);

      expect(resultado.generated).withContext('gerou 5 ocorrencias mensais').toBe(5);
      expect(resultado.seriesProcessed).withContext('uma serie ativa processada').toBe(1);
      expect(datasDe(ocorrencias))
        .withContext('dias 28/02 (clamp), 31/03 e 30/04 calculados da ancora 31/01')
        .toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
      expect((await lerSerie(setup, serieId))?.['generatedThrough'])
        .withContext('generatedThrough avancou para a ultima ocorrencia gerada')
        .toBe('2026-05-31');
    });

    it('[RED] semanal gera +7 dias a cada ocorrencia desde a ancora ate o fim do mes', async () => {
      const empresa = setup.mockCompanyId as string;
      const serieId = await semearSerie(setup, empresa, {
        anchorDate: '2026-03-02',
        period: 'semanal',
      });

      const resultado = await service.generateDueOccurrences(empresa, '2026-03-20');
      const ocorrencias = await ocorrenciasDaSerie(setup, empresa, serieId);

      expect(resultado.generated).toBe(5);
      expect(datasDe(ocorrencias)).toEqual([
        '2026-03-02',
        '2026-03-09',
        '2026-03-16',
        '2026-03-23',
        '2026-03-30',
      ]);
    });

    it('[RED] com generatedThrough, gera so as ocorrencias depois do generatedThrough, cruzando o mes', async () => {
      const empresa = setup.mockCompanyId as string;
      const serieId = await semearSerie(setup, empresa, {
        anchorDate: '2026-03-02',
        period: 'semanal',
        generatedThrough: '2026-03-16',
      });

      const resultado = await service.generateDueOccurrences(empresa, '2026-04-10');
      const ocorrencias = await ocorrenciasDaSerie(setup, empresa, serieId);

      expect(resultado.generated).withContext('6 ocorrencias apos 16/03 ate 30/04').toBe(6);
      expect(datasDe(ocorrencias))
        .withContext('16/03 ja estava materializada; 04/05 fica fora do mes corrente')
        .toEqual([
          '2026-03-23',
          '2026-03-30',
          '2026-04-06',
          '2026-04-13',
          '2026-04-20',
          '2026-04-27',
        ]);
    });

    it('[RED] nao gera ocorrencia alem do fim do mes corrente (ancora em junho, hoje em maio)', async () => {
      const empresa = setup.mockCompanyId as string;
      const serieId = await semearSerie(setup, empresa, {
        anchorDate: '2026-06-15',
        period: 'mensal',
      });

      const resultado = await service.generateDueOccurrences(empresa, '2026-05-10');
      const ocorrencias = await ocorrenciasDaSerie(setup, empresa, serieId);

      expect(resultado.generated).toBe(0);
      expect(ocorrencias.length).toBe(0);
    });

    it('[RED] inclui o proprio ultimo dia do mes (ancora 31/05, hoje 10/05)', async () => {
      const empresa = setup.mockCompanyId as string;
      const serieId = await semearSerie(setup, empresa, {
        anchorDate: '2026-05-31',
        period: 'mensal',
      });

      const resultado = await service.generateDueOccurrences(empresa, '2026-05-10');
      const ocorrencias = await ocorrenciasDaSerie(setup, empresa, serieId);

      expect(resultado.generated).toBe(1);
      expect(datasDe(ocorrencias)).toEqual(['2026-05-31']);
    });

    it('[RED] ocorrencia gerada nasce a_pagar, origin=recorrencia, com o template da serie', async () => {
      const empresa = setup.mockCompanyId as string;
      const serieId = await semearSerie(setup, empresa, {
        anchorDate: '2026-03-15',
        period: 'mensal',
        template: { description: 'Internet fixa', value: 120, categoryId: 'cat_internet' },
      });

      await service.generateDueOccurrences(empresa, '2026-03-20');
      const ocorrencias = await ocorrenciasDaSerie(setup, empresa, serieId);

      expect(ocorrencias.length).toBe(1);
      const primeira = ocorrencias[0];
      expect(primeira.status).toBe('a_pagar');
      expect(primeira.origin).toBe('recorrencia');
      expect(primeira.description).toBe('Internet fixa');
      expect(primeira.value).toBe(120);
      expect(primeira.categoryId).toBe('cat_internet');
      expect(primeira.companyId).toBe(empresa);
    });
  });

  describe('Regra 7.3: idempotencia e concorrencia (CRITICA)', () => {
    it('[RED] rodar duas vezes seguidas com o mesmo "hoje" nao duplica; a segunda gera zero', async () => {
      const empresa = setup.mockCompanyId as string;
      const serieId = await semearSerie(setup, empresa, {
        anchorDate: '2026-01-31',
        period: 'mensal',
      });

      const primeira = await service.generateDueOccurrences(empresa, '2026-05-10');
      const segunda = await service.generateDueOccurrences(empresa, '2026-05-10');
      const ocorrencias = await ocorrenciasDaSerie(setup, empresa, serieId);

      expect(primeira.generated).toBe(5);
      expect(segunda.generated).withContext('nada novo a gerar na segunda rodada').toBe(0);
      expect(ocorrencias.length).withContext('contagem exata, sem duplicata').toBe(5);
      expect((await lerSerie(setup, serieId))?.['generatedThrough']).toBe('2026-05-31');
    });

    it('[RED] duas chamadas concorrentes (Promise.all) geram a contagem exata, sem duplicata', async () => {
      const empresa = setup.mockCompanyId as string;
      const serieId = await semearSerie(setup, empresa, {
        anchorDate: '2026-01-31',
        period: 'mensal',
      });

      await Promise.all([
        service.generateDueOccurrences(empresa, '2026-05-10'),
        service.generateDueOccurrences(empresa, '2026-05-10'),
      ]);
      const ocorrencias = await ocorrenciasDaSerie(setup, empresa, serieId);
      const datas = datasDe(ocorrencias);

      expect(ocorrencias.length).withContext('contagem exata esperada').toBe(5);
      expect(new Set(datas).size).withContext('nenhuma data duplicada').toBe(datas.length);
      expect(datas).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
      expect((await lerSerie(setup, serieId))?.['generatedThrough']).toBe('2026-05-31');
    });

    it('[RED] ocorrencia apagada pelo usuario nao e recriada na proxima rodada', async () => {
      const empresa = setup.mockCompanyId as string;
      const serieId = await semearSerie(setup, empresa, {
        anchorDate: '2026-01-31',
        period: 'mensal',
      });
      await service.generateDueOccurrences(empresa, '2026-03-10');

      const antes = await ocorrenciasDaSerie(setup, empresa, serieId);
      const fevereiro = antes.find((o) => o.dueDate === '2026-02-28') as OcorrenciaLida;
      await deleteDoc(doc(setup.firestore, 'expenses', fevereiro.id));

      const novaRodada = await service.generateDueOccurrences(empresa, '2026-03-10');
      const depois = await ocorrenciasDaSerie(setup, empresa, serieId);

      expect(novaRodada.generated).withContext('a apagada nao volta').toBe(0);
      expect(datasDe(depois))
        .withContext('28/02 continua ausente apos nova rodada')
        .toEqual(['2026-01-31', '2026-03-31']);
    });

    it('[RED] ocorrencia apagada nao volta mesmo quando o catch-up avanca para outro mes', async () => {
      const empresa = setup.mockCompanyId as string;
      const serieId = await semearSerie(setup, empresa, {
        anchorDate: '2026-01-31',
        period: 'mensal',
      });
      await service.generateDueOccurrences(empresa, '2026-03-10');

      const antes = await ocorrenciasDaSerie(setup, empresa, serieId);
      const fevereiro = antes.find((o) => o.dueDate === '2026-02-28') as OcorrenciaLida;
      await deleteDoc(doc(setup.firestore, 'expenses', fevereiro.id));

      const abril = await service.generateDueOccurrences(empresa, '2026-04-10');
      const depois = await ocorrenciasDaSerie(setup, empresa, serieId);

      expect(abril.generated).withContext('so 30/04 e nova').toBe(1);
      expect(datasDe(depois)).toEqual(['2026-01-31', '2026-03-31', '2026-04-30']);
    });
  });

  describe('Regra 7.3: serie inativa e encerramento (CRITICA)', () => {
    it('[RED] serie com active=false nao gera nenhuma ocorrencia', async () => {
      const empresa = setup.mockCompanyId as string;
      const serieId = await semearSerie(setup, empresa, {
        active: false,
        anchorDate: '2026-01-31',
        period: 'mensal',
      });

      const resultado = await service.generateDueOccurrences(empresa, '2026-03-10');
      const ocorrencias = await ocorrenciasDaSerie(setup, empresa, serieId);

      expect(resultado.generated).toBe(0);
      expect(ocorrencias.length).toBe(0);
    });

    it('[RED] endSeries marca active=false + endedAt e mantem as ocorrencias ja geradas', async () => {
      const empresa = setup.mockCompanyId as string;
      const serieId = await semearSerie(setup, empresa, {
        anchorDate: '2026-01-31',
        period: 'mensal',
      });
      await service.generateDueOccurrences(empresa, '2026-03-10');

      await service.endSeries(serieId);
      const serie = await lerSerie(setup, serieId);
      const resultadoDepois = await service.generateDueOccurrences(empresa, '2026-05-10');
      const ocorrencias = await ocorrenciasDaSerie(setup, empresa, serieId);

      expect(serie?.['active']).withContext('serie encerrada').toBe(false);
      expect(serie?.['endedAt']).withContext('endedAt gravado').toBeDefined();
      expect(resultadoDepois.generated).withContext('serie encerrada nao gera mais').toBe(0);
      expect(datasDe(ocorrencias))
        .withContext('ocorrencias ja geradas permanecem')
        .toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    });
  });

  describe('Regra 7.3: createSeries grava serie + 1a ocorrencia (CRITICA)', () => {
    it('[RED] createSeries usa id deterministico ${seriesId}_${dueDate} na 1a ocorrencia', async () => {
      const resultado = await service.createSeries(
        novaSerieInput(categoriaId, { dueDate: '2026-03-15' }),
        'mensal',
      );

      expect(resultado.seriesId).withContext('seriesId preenchido').toBeTruthy();
      expect(resultado.firstExpenseId).toBe(`${resultado.seriesId}_2026-03-15`);
    });

    it('[RED] createSeries grava a serie com generatedThrough=dueDate e o template da despesa', async () => {
      const resultado = await service.createSeries(
        novaSerieInput(categoriaId, {
          dueDate: '2026-03-15',
          description: 'Aluguel loja',
          value: 150.5,
        }),
        'mensal',
      );
      const serie = await lerSerie(setup, resultado.seriesId);

      expect(serie?.['companyId']).toBe(setup.mockCompanyId);
      expect(serie?.['active']).toBe(true);
      expect(serie?.['period']).toBe('mensal');
      expect(serie?.['anchorDate']).toBe('2026-03-15');
      expect(serie?.['generatedThrough']).toBe('2026-03-15');
      expect(serie?.['template']?.['description']).toBe('Aluguel loja');
      expect(serie?.['template']?.['value']).toBe(150.5);
      expect(serie?.['template']?.['categoryId']).toBe(categoriaId);
    });

    it('[RED] createSeries grava a 1a ocorrencia como a_pagar, origin=recorrencia, vinculada a serie', async () => {
      const empresa = setup.mockCompanyId as string;
      const resultado = await service.createSeries(
        novaSerieInput(categoriaId, { dueDate: '2026-03-15' }),
        'mensal',
      );
      const ocorrencias = await ocorrenciasDaSerie(setup, empresa, resultado.seriesId);

      expect(ocorrencias.length).toBe(1);
      expect(ocorrencias[0].id).toBe(resultado.firstExpenseId);
      expect(ocorrencias[0].status).toBe('a_pagar');
      expect(ocorrencias[0].origin).toBe('recorrencia');
      expect(ocorrencias[0].seriesId).toBe(resultado.seriesId);
      expect(ocorrencias[0].dueDate).toBe('2026-03-15');
    });
  });

  describe('Regra 7.3: isolamento por companyId (CRITICA)', () => {
    it('[RED] serie de outra empresa nunca e processada; a rodada conta so a da empresa informada', async () => {
      const outra = await setupSecondUserContext();
      try {
        const minhaEmpresa = setup.mockCompanyId as string;
        const empresaAlheia = outra.mockCompanyId as string;
        const minhaSerie = await semearSerie(setup, minhaEmpresa, {
          anchorDate: '2026-01-31',
          period: 'mensal',
        });
        const serieAlheia = await semearSerie(outra, empresaAlheia, {
          anchorDate: '2026-01-31',
          period: 'mensal',
        });

        const resultado = await service.generateDueOccurrences(minhaEmpresa, '2026-03-10');

        expect(resultado.generated)
          .withContext('so as 3 ocorrencias da propria serie (31/01, 28/02, 31/03)')
          .toBe(3);
        expect(resultado.seriesProcessed).toBe(1);
        expect((await ocorrenciasDaSerie(setup, minhaEmpresa, minhaSerie)).length).toBe(3);
        expect((await ocorrenciasDaSerie(outra, empresaAlheia, serieAlheia)).length)
          .withContext('serie alheia continua sem ocorrencias')
          .toBe(0);
        expect((await lerSerie(outra, serieAlheia))?.['generatedThrough'])
          .withContext('generatedThrough alheio intocado')
          .toBeUndefined();
      } finally {
        await outra.cleanup();
      }
    });

    it('[RED] companyId vazio lanca erro e nao gera nada', async () => {
      await expectRejeicaoDeRegra(() => service.generateDueOccurrences('', '2026-03-10'));
    });
  });
});

describe('ExpenseRecurrenceService - endSeries (isolamento e encerramento, CRITICA)', () => {
  let service: ExpenseRecurrenceService;
  let setup: EmulatorTestSetup;

  beforeEach(async () => {
    setup = await setupFirestoreEmulatorTest();
    service = configurarServico(setup);
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  it('[RED] endSeries de serie de outra empresa rejeita e a serie alheia continua active', async () => {
    const outra = await setupSecondUserContext();
    try {
      const serieAlheia = await semearSerie(outra, outra.mockCompanyId as string, {
        anchorDate: '2026-01-31',
        period: 'mensal',
      });

      await expectRejeicaoDeRegra(() => service.endSeries(serieAlheia));

      expect((await lerSerie(outra, serieAlheia))?.['active'])
        .withContext('serie alheia segue ativa')
        .toBe(true);
    } finally {
      await outra.cleanup();
    }
  });

  it('[RED] endSeries em serie ja encerrada rejeita e preserva o endedAt original', async () => {
    const empresa = setup.mockCompanyId as string;
    const serieId = await semearSerie(setup, empresa, {
      anchorDate: '2026-01-31',
      period: 'mensal',
    });
    await service.endSeries(serieId);
    const endedAtOriginal = (await lerSerie(setup, serieId))?.['endedAt'] as Timestamp;
    expect(endedAtOriginal).withContext('primeiro encerramento grava endedAt').toBeDefined();

    await expectRejeicaoDeRegra(() => service.endSeries(serieId));

    const endedAtDepois = (await lerSerie(setup, serieId))?.['endedAt'] as Timestamp;
    expect(endedAtDepois.toMillis())
      .withContext('endedAt original preservado')
      .toBe(endedAtOriginal.toMillis());
  });
});

describe('ExpenseRecurrenceService - lote grande (CRITICA)', () => {
  let service: ExpenseRecurrenceService;
  let setup: EmulatorTestSetup;

  beforeEach(async () => {
    setup = await setupFirestoreEmulatorTest();
    service = configurarServico(setup);
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  it('[RED] serie semanal de ~8 anos gera todas as ocorrencias em lotes, sem duplicata; 2a rodada gera zero', async () => {
    const empresa = setup.mockCompanyId as string;
    const serieId = await semearSerie(setup, empresa, {
      anchorDate: '2018-10-01',
      period: 'semanal',
    });
    const esperadas = ExpenseScheduleService.occurrenceDates(
      '2018-10-01',
      'semanal',
      null,
      '2026-10-31',
    );
    expect(esperadas.length)
      .withContext('mais de 400 ocorrencias: exige mais de um lote de transacao')
      .toBeGreaterThan(400);

    const primeira = await service.generateDueOccurrences(empresa, '2026-10-22');
    const ocorrencias = await ocorrenciasDaSerie(setup, empresa, serieId);
    const ids = ocorrencias.map((o) => o.id);

    expect(primeira.generated).withContext('contagem exata da 1a rodada').toBe(esperadas.length);
    expect(ocorrencias.length).withContext('contagem exata de docs').toBe(esperadas.length);
    expect(new Set(ids).size).withContext('ids unicos').toBe(ids.length);
    expect(datasDe(ocorrencias)).toEqual([...esperadas].sort());
    expect((await lerSerie(setup, serieId))?.['generatedThrough'])
      .withContext('generatedThrough = ultima data <= fim do mes')
      .toBe(esperadas[esperadas.length - 1]);

    const segunda = await service.generateDueOccurrences(empresa, '2026-10-22');
    expect(segunda.generated).withContext('2a rodada nao gera nada').toBe(0);
  }, 120000);
});

describe('ExpenseRecurrenceService - getSeries (isolamento)', () => {
  let service: ExpenseRecurrenceService;
  let setup: EmulatorTestSetup;

  beforeEach(async () => {
    setup = await setupFirestoreEmulatorTest();
    service = configurarServico(setup);
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  it('[RED] getSeries retorna so series ativas da empresa da sessao', async () => {
    const outra = await setupSecondUserContext();
    try {
      const empresa = setup.mockCompanyId as string;
      const ativa = await semearSerie(setup, empresa, { active: true });
      const inativa = await semearSerie(setup, empresa, { active: false });
      const alheia = await semearSerie(outra, outra.mockCompanyId as string, { active: true });

      const series = await firstValueFrom(service.getSeries());
      const ids = series.map((s) => s.id);

      expect(ids).withContext('serie ativa da propria empresa aparece').toContain(ativa);
      expect(ids).withContext('serie inativa fica fora').not.toContain(inativa);
      expect(ids).withContext('serie de outra empresa fica fora').not.toContain(alheia);
      expect(series.every((s) => s.companyId === empresa))
        .withContext('toda serie retornada pertence a empresa da sessao')
        .toBeTrue();
    } finally {
      await outra.cleanup();
    }
  });
});

describe('ExpenseRecurrenceService - createSeries validacoes (CRITICA)', () => {
  let service: ExpenseRecurrenceService;
  let setup: EmulatorTestSetup;
  let categoriaId: string;

  beforeEach(async () => {
    setup = await setupFirestoreEmulatorTest();
    service = configurarServico(setup);
    categoriaId = await semearCategoria(setup, setup.mockCompanyId as string);
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  it('[RED] createSeries rejeita value NaN e nao grava nada', async () => {
    await expectCriarSerieRejeitadaSemGravar(
      service,
      setup,
      novaSerieInput(categoriaId, { value: NaN }),
      'mensal',
    );
  });

  it('[RED] createSeries rejeita value 0 e nao grava nada', async () => {
    await expectCriarSerieRejeitadaSemGravar(
      service,
      setup,
      novaSerieInput(categoriaId, { value: 0 }),
      'mensal',
    );
  });

  it('[RED] createSeries rejeita value negativo e nao grava nada', async () => {
    await expectCriarSerieRejeitadaSemGravar(
      service,
      setup,
      novaSerieInput(categoriaId, { value: -1 }),
      'mensal',
    );
  });

  it('[RED] createSeries rejeita dueDate inexistente (2026-02-30) e nao grava nada', async () => {
    await expectCriarSerieRejeitadaSemGravar(
      service,
      setup,
      novaSerieInput(categoriaId, { dueDate: '2026-02-30' }),
      'mensal',
    );
  });

  it('[RED] createSeries rejeita dueDate vazia e nao grava nada', async () => {
    await expectCriarSerieRejeitadaSemGravar(
      service,
      setup,
      novaSerieInput(categoriaId, { dueDate: '' }),
      'mensal',
    );
  });

  it('[RED] createSeries rejeita period invalido ("anual") e nao grava nada', async () => {
    await expectCriarSerieRejeitadaSemGravar(
      service,
      setup,
      novaSerieInput(categoriaId),
      'anual' as any,
    );
  });

  it('[RED] createSeries rejeita categoria de outra empresa e nao grava nada', async () => {
    const outra = await setupSecondUserContext();
    try {
      const categoriaAlheia = await semearCategoria(outra, outra.mockCompanyId as string);
      await expectCriarSerieRejeitadaSemGravar(
        service,
        setup,
        novaSerieInput(categoriaAlheia),
        'mensal',
      );
    } finally {
      await outra.cleanup();
    }
  });

  it('[RED] createSeries rejeita categoria ARQUIVADA da propria empresa e nao grava nada', async () => {
    const arquivada = await semearCategoria(setup, setup.mockCompanyId as string, {
      archived: true,
    });
    await expectCriarSerieRejeitadaSemGravar(service, setup, novaSerieInput(arquivada), 'mensal');
  });
});

describe('ExpenseRecurrenceService - serie envenenada (CRITICA)', () => {
  let service: ExpenseRecurrenceService;
  let setup: EmulatorTestSetup;

  beforeEach(async () => {
    setup = await setupFirestoreEmulatorTest();
    service = configurarServico(setup);
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  it('[RED] serie com anchorDate invalido nao bloqueia as validas: processa todas, relanca no fim', async () => {
    const empresa = setup.mockCompanyId as string;
    // Ids com ordem garantida na varredura (aa_ antes de zz_): a envenenada
    // e lida primeiro, entao um service que aborta no 1o erro nao chega a valida.
    const envenenadaId = `aa_envenenada_${idUnico()}`;
    const validaId = `zz_valida_${idUnico()}`;
    const base = {
      companyId: empresa,
      active: true,
      period: 'mensal',
      template: { description: 'Serie', value: 10, categoryId: 'cat_x' },
      createdAt: Timestamp.now(),
    };
    await setDoc(doc(setup.firestore, 'expenseSeries', envenenadaId), {
      ...base,
      anchorDate: '2026-02-30',
    });
    await setDoc(doc(setup.firestore, 'expenseSeries', validaId), {
      ...base,
      anchorDate: '2026-01-31',
    });

    await expectRejeicaoDeRegra(() => service.generateDueOccurrences(empresa, '2026-03-10'));

    const ocorrenciasValida = await ocorrenciasDaSerie(setup, empresa, validaId);
    expect(datasDe(ocorrenciasValida))
      .withContext('a serie valida foi processada apesar da envenenada')
      .toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect((await lerSerie(setup, validaId))?.['generatedThrough'])
      .withContext('marca-d agua da valida avancou')
      .toBe('2026-03-31');
    expect((await lerSerie(setup, envenenadaId))?.['generatedThrough'])
      .withContext('serie envenenada nao recebe marca-d agua')
      .toBeUndefined();
  });
});
