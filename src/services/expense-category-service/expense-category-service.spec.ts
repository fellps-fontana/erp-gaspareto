import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { firstValueFrom } from 'rxjs';
import { ExpenseCategoryService } from './expense-category-service';
import { TenantService } from '../tenant-service/tenant-service';
import { DEFAULT_EXPENSE_CATEGORIES } from '../../models/expense-category-defaults';
import { ExpenseCategory, ExpenseCategoryType } from '../../models/expense-model';
import {
  EmulatorTestContext,
  EmulatorTestSetup,
  setupFirestoreEmulatorTest,
  setupSecondUserContext,
} from '../test-helpers';

// Fixtures com id unico por execucao (nunca IDs fixos de documento).
function idUnico(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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

async function lerCategoria(
  contexto: EmulatorTestContext,
  id: string,
): Promise<ExpenseCategory | undefined> {
  const snap = await getDoc(doc(contexto.firestore, 'expenseCategories', id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as ExpenseCategory) : undefined;
}

// Existencia sem get() nem where(documentId()): ambos caem na rule com
// resource nulo quando o documento foi apagado (permission-denied). Lista so
// as categorias da empresa da sessao e procura o id entre elas.
async function existeCategoria(
  contexto: EmulatorTestContext,
  companyId: string,
  id: string,
): Promise<boolean> {
  const snap = await getDocs(
    query(collection(contexto.firestore, 'expenseCategories'), where('companyId', '==', companyId)),
  );
  return snap.docs.some((d) => d.id === id);
}

async function listarCategoriasDaEmpresa(
  contexto: EmulatorTestContext,
  companyId: string,
): Promise<ExpenseCategory[]> {
  const snap = await getDocs(
    query(collection(contexto.firestore, 'expenseCategories'), where('companyId', '==', companyId)),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ExpenseCategory);
}

async function semearCategoria(
  contexto: EmulatorTestContext,
  companyId: string,
  name: string,
  type: ExpenseCategoryType = 'despesa_operacional',
): Promise<string> {
  const ref = await addDoc(collection(contexto.firestore, 'expenseCategories'), {
    companyId,
    name,
    type,
    archived: false,
    createdAt: Timestamp.now(),
  });
  return ref.id;
}

async function semearDespesaVinculada(
  contexto: EmulatorTestContext,
  companyId: string,
  categoryId: string,
): Promise<string> {
  const ref = await addDoc(collection(contexto.firestore, 'expenses'), {
    companyId,
    description: `Despesa vinculada ${idUnico()}`,
    value: 10,
    categoryId,
    dueDate: '2026-11-10',
    status: 'a_pagar',
    origin: 'manual',
    createdAt: Timestamp.now(),
  });
  return ref.id;
}

async function semearSerieVinculada(
  contexto: EmulatorTestContext,
  companyId: string,
  categoryId: string,
): Promise<string> {
  const ref = await addDoc(collection(contexto.firestore, 'expenseSeries'), {
    companyId,
    active: true,
    period: 'mensal',
    anchorDate: '2026-10-01',
    template: {
      description: `Serie vinculada ${idUnico()}`,
      value: 10,
      categoryId,
    },
    createdAt: Timestamp.now(),
  });
  return ref.id;
}

function configurarServico(contexto: EmulatorTestSetup): ExpenseCategoryService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      ExpenseCategoryService,
      { provide: TenantService, useValue: contexto.tenantService },
      { provide: Firestore, useValue: contexto.firestore },
    ],
  });
  return TestBed.inject(ExpenseCategoryService);
}

describe('ExpenseCategoryService - padrao, escritas e isolamento', () => {
  let service: ExpenseCategoryService;
  let setup: EmulatorTestSetup;

  beforeEach(async () => {
    setup = await setupFirestoreEmulatorTest();
    service = configurarServico(setup);
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  describe('ensureDefaults() - categorias padrao (regra 8.1)', () => {
    it('[RED] cria as 12 categorias padrao com ID ${companyId}_${systemKey} e nome/tipo corretos', async () => {
      await service.ensureDefaults();

      const companyId = setup.mockCompanyId as string;
      for (const def of DEFAULT_EXPENSE_CATEGORIES) {
        const cat = await lerCategoria(setup, `${companyId}_${def.systemKey}`);
        expect({
          systemKey: def.systemKey,
          name: cat?.name,
          type: cat?.type,
          companyId: cat?.companyId,
          archived: cat?.archived,
        }).toEqual({
          systemKey: def.systemKey,
          name: def.name,
          type: def.type,
          companyId,
          archived: false,
        });
      }
    });

    it('[RED] gera 2 categorias custo_producao e 10 despesa_operacional', async () => {
      await service.ensureDefaults();

      const categorias = await listarCategoriasDaEmpresa(setup, setup.mockCompanyId as string);
      expect(categorias.length).toBe(12);
      expect(categorias.filter((c) => c.type === 'custo_producao').length).toBe(2);
      expect(categorias.filter((c) => c.type === 'despesa_operacional').length).toBe(10);
    });

    it('[RED] e idempotente: duas chamadas resultam em exatamente 12 categorias', async () => {
      await service.ensureDefaults();
      await service.ensureDefaults();

      const categorias = await listarCategoriasDaEmpresa(setup, setup.mockCompanyId as string);
      expect(categorias.length).toBe(12);
    });

    it('[RED] nao sobrescreve categoria renomeada pelo usuario entre duas chamadas', async () => {
      await service.ensureDefaults();
      const companyId = setup.mockCompanyId as string;
      await updateDoc(doc(setup.firestore, 'expenseCategories', `${companyId}_aluguel`), {
        name: 'Aluguel da sede',
      });

      await service.ensureDefaults();

      expect((await lerCategoria(setup, `${companyId}_aluguel`))?.name).toBe('Aluguel da sede');
    });
  });

  describe('addCategory() - tipo obrigatorio (regra 8.1)', () => {
    it('[RED] cria categoria com name e type informados, archived false e sem systemKey', async () => {
      const id = await service.addCategory('Assinaturas', 'despesa_operacional');

      expect(typeof id).toBe('string');
      const salva = await lerCategoria(setup, id);
      expect(salva?.name).toBe('Assinaturas');
      expect(salva?.type).toBe('despesa_operacional');
      expect(salva?.archived).toBeFalse();
      expect(salva?.systemKey).toBeUndefined();
      expect(salva?.companyId).toBe(setup.mockCompanyId as string);
    });

    it('[RED] aceita custo_producao como tipo', async () => {
      const id = await service.addCategory('Embalagens extras', 'custo_producao');

      expect((await lerCategoria(setup, id))?.type).toBe('custo_producao');
    });

    it('[RED] sem tipo valido lanca e nao grava categoria', async () => {
      const companyId = setup.mockCompanyId as string;

      await expectRejeicaoDeRegra(() =>
        service.addCategory('Sem tipo', undefined as unknown as ExpenseCategoryType),
      );
      await expectRejeicaoDeRegra(() =>
        service.addCategory('Tipo invalido', 'tipo_inexistente' as ExpenseCategoryType),
      );

      expect((await listarCategoriasDaEmpresa(setup, companyId)).length).toBe(0);
    });
  });

  describe('renameCategory() - tipo imutavel (regra 8.1)', () => {
    it('[RED] renomeia mantendo o name novo e o type original', async () => {
      const id = await service.addCategory('Nome antigo', 'custo_producao');

      await service.renameCategory(id, 'Nome novo');

      const salva = await lerCategoria(setup, id);
      expect(salva?.name).toBe('Nome novo');
      expect(salva?.type).toBe('custo_producao');
    });
  });

  describe('setArchived()', () => {
    it('[RED] arquiva e desarquiva a categoria', async () => {
      const id = await service.addCategory('Temporaria', 'despesa_operacional');

      await service.setArchived(id, true);
      expect((await lerCategoria(setup, id))?.archived).toBeTrue();

      await service.setArchived(id, false);
      expect((await lerCategoria(setup, id))?.archived).toBeFalse();
    });
  });

  describe('deleteCategory() - exclusao so sem vinculo (regra 8.1)', () => {
    it('[RED] exclui categoria sem nenhum vinculo', async () => {
      const id = await service.addCategory('Sem vinculo', 'despesa_operacional');

      await service.deleteCategory(id);

      expect(await existeCategoria(setup, setup.mockCompanyId as string, id)).toBeFalse();
    });

    it('[RED] lanca ao excluir categoria com despesa vinculada e mantem o documento', async () => {
      const companyId = setup.mockCompanyId as string;
      const id = await service.addCategory('Com despesa', 'despesa_operacional');
      await semearDespesaVinculada(setup, companyId, id);

      await expectRejeicaoDeRegra(() => service.deleteCategory(id));

      expect(await lerCategoria(setup, id)).toBeDefined();
    });

    it('[RED] lanca ao excluir categoria com serie recorrente vinculada e mantem o documento', async () => {
      const companyId = setup.mockCompanyId as string;
      const id = await service.addCategory('Com serie', 'despesa_operacional');
      await semearSerieVinculada(setup, companyId, id);

      await expectRejeicaoDeRegra(() => service.deleteCategory(id));

      expect(await lerCategoria(setup, id)).toBeDefined();
    });

    it('[RED] lanca ao excluir categoria ARQUIVADA que ainda tem despesa vinculada', async () => {
      const companyId = setup.mockCompanyId as string;
      const id = await service.addCategory('Arquivada com despesa', 'despesa_operacional');
      await service.setArchived(id, true);
      await semearDespesaVinculada(setup, companyId, id);

      await expectRejeicaoDeRegra(() => service.deleteCategory(id));

      expect(await lerCategoria(setup, id)).toBeDefined();
    });
  });

  describe('Regra: isolamento por companyId (CRITICA)', () => {
    it('[RED] getCategories retorna so categorias da empresa da sessao', async () => {
      const outra = await setupSecondUserContext();
      try {
        await service.addCategory('Minha categoria', 'despesa_operacional');
        await semearCategoria(outra, outra.mockCompanyId as string, 'Categoria alheia');

        const categorias = await firstValueFrom(service.getCategories());

        expect(categorias.some((c) => c.name === 'Minha categoria'))
          .withContext('categoria da propria empresa deve aparecer')
          .toBeTrue();
        expect(categorias.some((c) => c.name === 'Categoria alheia'))
          .withContext('categoria de outra empresa NAO deve aparecer')
          .toBeFalse();
      } finally {
        await outra.cleanup();
      }
    });

    it('[RED] deleteCategory em categoria de outra empresa lanca e o documento permanece', async () => {
      const outra = await setupSecondUserContext();
      try {
        const alheiaId = await semearCategoria(
          outra,
          outra.mockCompanyId as string,
          'Alheia para excluir',
        );

        await expectRejeicaoDeRegra(() => service.deleteCategory(alheiaId));

        expect(await lerCategoria(outra, alheiaId)).toBeDefined();
      } finally {
        await outra.cleanup();
      }
    });
  });

  describe('ensureDefaults() - seed unico (decisao do Kira)', () => {
    it('[RED] padrao excluida sem vinculo NAO volta na proxima chamada (11 docs)', async () => {
      const companyId = setup.mockCompanyId as string;
      await service.ensureDefaults();
      await service.deleteCategory(`${companyId}_aluguel`);

      await service.ensureDefaults();

      const categorias = await listarCategoriasDaEmpresa(setup, companyId);
      expect(categorias.length).withContext('11 categorias apos excluir uma padrao').toBe(11);
      expect(await existeCategoria(setup, companyId, `${companyId}_aluguel`))
        .withContext('a padrao excluida nao pode ser recriada')
        .toBeFalse();
    });

    it('[RED] empresa com so 1 categoria custom: ensureDefaults nao cria nenhuma padrao', async () => {
      const companyId = setup.mockCompanyId as string;
      await semearCategoria(setup, companyId, 'Custom unica');

      await service.ensureDefaults();

      const categorias = await listarCategoriasDaEmpresa(setup, companyId);
      expect(categorias.length).withContext('apenas a categoria custom deve existir').toBe(1);
      expect(categorias[0].name).toBe('Custom unica');
    });
  });

  describe('Regra: escrita exige companyId da sessao (CRITICA)', () => {
    let semEmpresa: EmulatorTestSetup;
    let servicoSemEmpresa: ExpenseCategoryService;

    beforeEach(async () => {
      semEmpresa = await setupFirestoreEmulatorTest(null);
      servicoSemEmpresa = configurarServico(semEmpresa);
    });

    afterEach(async () => {
      await semEmpresa.cleanup();
    });

    const escritas: Array<[string, (s: ExpenseCategoryService) => Promise<unknown>]> = [
      ['ensureDefaults', (s) => s.ensureDefaults()],
      ['addCategory', (s) => s.addCategory('Nova', 'despesa_operacional')],
      ['renameCategory', (s) => s.renameCategory('id-qualquer', 'Novo nome')],
      ['setArchived', (s) => s.setArchived('id-qualquer', true)],
      ['deleteCategory', (s) => s.deleteCategory('id-qualquer')],
    ];

    for (const [nome, chamar] of escritas) {
      it(`[RED] ${nome} lanca quando companyId da sessao e nulo`, async () => {
        await expectAsync(promessaDe(() => chamar(servicoSemEmpresa))).toBeRejectedWithError(
          /companyId|empresa|tenant|null/i,
        );
      });
    }
  });
});
