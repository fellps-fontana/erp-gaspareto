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
  where,
} from 'firebase/firestore';
import { firstValueFrom } from 'rxjs';
import { ExpenseService } from './expense-service';
import { TenantService } from '../tenant-service/tenant-service';
import { Expense, NewExpenseInput } from '../../models/expense-model';
import { PaymentMethod } from '../../models/sell-model';
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

// Categoria REAL da empresa da sessao (addExpense valida categoryId). Setada no beforeEach.
let categoriaDaEmpresa = '';

function novaDespesa(parcial: Partial<NewExpenseInput> = {}): NewExpenseInput {
  return {
    description: `Despesa ${idUnico()}`,
    value: 150.5,
    categoryId: categoriaDaEmpresa,
    dueDate: '2026-11-10',
    ...parcial,
  };
}

// Seed direto no Firestore (fixture), sem passar pelo service sob teste.
async function semearDespesa(
  contexto: EmulatorTestContext,
  companyId: string,
  parcial: Partial<Expense> = {},
): Promise<string> {
  const ref = await addDoc(collection(contexto.firestore, 'expenses'), {
    companyId,
    description: `Semeada ${idUnico()}`,
    value: 10,
    categoryId: 'cat_semeada',
    dueDate: '2026-11-10',
    status: 'a_pagar',
    origin: 'manual',
    createdAt: Timestamp.now(),
    ...parcial,
  });
  return ref.id;
}

async function lerDespesa(contexto: EmulatorTestContext, id: string): Promise<Expense | undefined> {
  const snap = await getDoc(doc(contexto.firestore, 'expenses', id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Expense) : undefined;
}

// Existencia sem get() nem where(documentId()): ambos caem na rule com
// resource nulo quando o documento foi apagado (permission-denied). Lista so
// as despesas da empresa da sessao e procura o id entre elas.
async function existeDespesa(
  contexto: EmulatorTestContext,
  companyId: string,
  id: string,
): Promise<boolean> {
  const snap = await getDocs(
    query(collection(contexto.firestore, 'expenses'), where('companyId', '==', companyId)),
  );
  return snap.docs.some((d) => d.id === id);
}

async function contarDespesasDaEmpresa(
  contexto: EmulatorTestContext,
  companyId: string,
): Promise<number> {
  const snap = await getDocs(
    query(collection(contexto.firestore, 'expenses'), where('companyId', '==', companyId)),
  );
  return snap.size;
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

async function semearCategoriaDaEmpresa(
  contexto: EmulatorTestContext,
  companyId: string,
): Promise<string> {
  const ref = await addDoc(collection(contexto.firestore, 'expenseCategories'), {
    companyId,
    name: `Categoria ${idUnico()}`,
    type: 'despesa_operacional',
    archived: false,
    createdAt: Timestamp.now(),
  });
  return ref.id;
}

// Prova ausencia listando a empresa e comparando descricao (nunca getDoc de id inexistente).
async function existeDespesaComDescricao(
  contexto: EmulatorTestContext,
  companyId: string,
  descricao: string,
): Promise<boolean> {
  const snap = await getDocs(
    query(collection(contexto.firestore, 'expenses'), where('companyId', '==', companyId)),
  );
  return snap.docs.some((d) => d.data()['description'] === descricao);
}

const DATAS_INVALIDAS = ['2026-13-01', '2026-02-30', '', '01/02/2026'];
const VALORES_INVALIDOS = [Number.NaN, Number.POSITIVE_INFINITY, 0, -10];

function configurarServico(contexto: EmulatorTestSetup): ExpenseService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      ExpenseService,
      { provide: TenantService, useValue: contexto.tenantService },
      { provide: Firestore, useValue: contexto.firestore },
    ],
  });
  return TestBed.inject(ExpenseService);
}

describe('ExpenseService - isolamento e escritas', () => {
  let service: ExpenseService;
  let setup: EmulatorTestSetup;

  beforeEach(async () => {
    setup = await setupFirestoreEmulatorTest();
    service = configurarServico(setup);
    categoriaDaEmpresa = await semearCategoriaDaEmpresa(setup, setup.mockCompanyId as string);
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  describe('Regra: isolamento por companyId (CRITICA)', () => {
    describe('getExpenses() - leitura', () => {
      it('[RED] retorna so despesas da empresa da sessao; despesa estrangeira nao aparece', async () => {
        const outra = await setupSecondUserContext();
        try {
          const minhaDescricao = `Minha ${idUnico()}`;
          const alheiaDescricao = `Alheia ${idUnico()}`;
          await semearDespesa(setup, setup.mockCompanyId as string, {
            description: minhaDescricao,
          });
          await semearDespesa(outra, outra.mockCompanyId as string, {
            description: alheiaDescricao,
          });

          const despesas = await firstValueFrom(service.getExpenses());

          expect(despesas.some((d) => d.description === minhaDescricao))
            .withContext('despesa da propria empresa deve aparecer')
            .toBeTrue();
          expect(despesas.some((d) => d.description === alheiaDescricao))
            .withContext('despesa de outra empresa NAO deve aparecer')
            .toBeFalse();
          expect(despesas.every((d) => d.companyId === setup.mockCompanyId))
            .withContext('toda despesa retornada pertence a empresa da sessao')
            .toBeTrue();
        } finally {
          await outra.cleanup();
        }
      });
    });

    describe('escritas sobre documento de outra empresa', () => {
      it('[RED] markAsPaid em despesa de outra empresa lanca e nao altera o documento', async () => {
        const outra = await setupSecondUserContext();
        try {
          const alheiaId = await semearDespesa(outra, outra.mockCompanyId as string);

          await expectRejeicaoDeRegra(() => service.markAsPaid(alheiaId, '2026-10-22'));

          const depois = await lerDespesa(outra, alheiaId);
          expect(depois?.status).toBe('a_pagar');
        } finally {
          await outra.cleanup();
        }
      });

      it('[RED] deleteExpense em despesa de outra empresa lanca e o documento permanece', async () => {
        const outra = await setupSecondUserContext();
        try {
          const alheiaId = await semearDespesa(outra, outra.mockCompanyId as string);

          await expectRejeicaoDeRegra(() => service.deleteExpense(alheiaId));

          expect(await lerDespesa(outra, alheiaId)).toBeDefined();
        } finally {
          await outra.cleanup();
        }
      });
    });
  });

  describe('addExpense() - injecao de campos', () => {
    it('[RED] injeta companyId da sessao, status a_pagar e origin manual', async () => {
      const id = await service.addExpense(novaDespesa());

      expect(typeof id).toBe('string');
      const salva = await lerDespesa(setup, id);
      expect(salva?.companyId).toBe(setup.mockCompanyId as string);
      expect(salva?.status).toBe('a_pagar');
      expect(salva?.origin).toBe('manual');
    });
  });

  describe('addInstallments() - parcelamento (regra 7.2)', () => {
    it('[RED] grava N parcelas com soma exata em centavos, vencimentos mensais da 1a data e mesmo installmentGroupId', async () => {
      const ids = await service.addInstallments(
        novaDespesa({ value: 100, dueDate: '2026-01-31' }),
        3,
      );

      expect(ids.length).toBe(3);
      const lidas = await Promise.all(ids.map((id) => lerDespesa(setup, id)));
      const parcelas = lidas
        .filter((p): p is Expense => p !== undefined)
        .sort((a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0));

      expect(parcelas.length).toBe(3);
      expect(parcelas.map((p) => p.installmentNumber)).toEqual([1, 2, 3]);
      expect(parcelas.map((p) => p.value)).toEqual([33.33, 33.33, 33.34]);
      expect(parcelas.reduce((acc, p) => acc + Math.round(p.value * 100), 0))
        .withContext('soma das parcelas deve ser o total exato')
        .toBe(10000);
      expect(parcelas.map((p) => p.dueDate)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
      expect(parcelas.every((p) => p.installmentTotal === 3)).toBeTrue();
      expect(
        parcelas.every((p) => p.origin === 'parcelamento' && p.status === 'a_pagar'),
      ).toBeTrue();
      expect(parcelas.every((p) => p.companyId === setup.mockCompanyId)).toBeTrue();

      const grupos = new Set(parcelas.map((p) => p.installmentGroupId));
      expect(grupos.size).withContext('todas as parcelas no mesmo grupo').toBe(1);
      expect(grupos.has(undefined)).withContext('installmentGroupId definido').toBeFalse();
    });

    it('[RED] com N=1 grava uma unica despesa com o valor total', async () => {
      const ids = await service.addInstallments(novaDespesa({ value: 150.5 }), 1);

      expect(ids.length).toBe(1);
      const unica = await lerDespesa(setup, ids[0]);
      expect(unica?.value).toBe(150.5);
      expect(unica?.installmentTotal).toBe(1);
    });

    it('[RED] com N fora de 1..120 lanca e nao grava nenhuma despesa', async () => {
      await expectRejeicaoDeRegra(() => service.addInstallments(novaDespesa(), 0));
      await expectRejeicaoDeRegra(() => service.addInstallments(novaDespesa(), 121));

      expect(await contarDespesasDaEmpresa(setup, setup.mockCompanyId as string))
        .withContext('nenhuma parcela deve ser gravada')
        .toBe(0);
    });
  });

  describe('markAsPaid() - transicao a_pagar -> pago (regra 7.1)', () => {
    it('[RED] grava paidDate e paymentMethod informados', async () => {
      const id = await service.addExpense(novaDespesa());

      await service.markAsPaid(id, '2026-10-22', PaymentMethod.PIX);

      const paga = await lerDespesa(setup, id);
      expect(paga?.status).toBe('pago');
      expect(paga?.paidDate).toBe('2026-10-22');
      expect(paga?.paymentMethod).toBe(PaymentMethod.PIX);
    });

    it('[RED] sem paymentMethod grava so paidDate (campo ausente)', async () => {
      const id = await service.addExpense(novaDespesa());

      await service.markAsPaid(id, '2026-10-22');

      const paga = await lerDespesa(setup, id);
      expect(paga?.status).toBe('pago');
      expect(paga?.paidDate).toBe('2026-10-22');
      expect(paga?.paymentMethod).toBeUndefined();
    });

    it('[RED] pagar despesa ja paga lanca e preserva o paidDate original', async () => {
      const id = await service.addExpense(novaDespesa());
      await service.markAsPaid(id, '2026-10-20');

      await expectRejeicaoDeRegra(() => service.markAsPaid(id, '2026-10-25'));

      expect((await lerDespesa(setup, id))?.paidDate).toBe('2026-10-20');
    });

    it('[RED] pagar despesa inexistente lanca', async () => {
      await expectRejeicaoDeRegra(() =>
        service.markAsPaid(`inexistente-${idUnico()}`, '2026-10-22'),
      );
    });
  });

  describe('markGoodsReceived() - "Chegou" (regra 7.1)', () => {
    it('[RED] grava goodsReceivedDate sem alterar o status a_pagar', async () => {
      const id = await service.addExpense(novaDespesa());

      await service.markGoodsReceived(id, '2026-10-20');

      const salva = await lerDespesa(setup, id);
      expect(salva?.goodsReceivedDate).toBe('2026-10-20');
      expect(salva?.status).toBe('a_pagar');
    });

    it('[RED] grava goodsReceivedDate mesmo em despesa ja paga (independe do status)', async () => {
      const id = await service.addExpense(novaDespesa());
      await service.markAsPaid(id, '2026-10-19');

      await service.markGoodsReceived(id, '2026-10-20');

      const salva = await lerDespesa(setup, id);
      expect(salva?.goodsReceivedDate).toBe('2026-10-20');
      expect(salva?.status).toBe('pago');
    });
  });

  describe('updateExpense() e deleteExpense()', () => {
    it('[RED] updateExpense altera o campo informado e mantem companyId, status e origin', async () => {
      const id = await service.addExpense(novaDespesa({ description: 'Original' }));

      await service.updateExpense(id, { description: 'Atualizada' });

      const salva = await lerDespesa(setup, id);
      expect(salva?.description).toBe('Atualizada');
      expect(salva?.companyId).toBe(setup.mockCompanyId as string);
      expect(salva?.status).toBe('a_pagar');
      expect(salva?.origin).toBe('manual');
    });

    it('[RED] deleteExpense remove o documento (exclusao real)', async () => {
      const id = await service.addExpense(novaDespesa());

      await service.deleteExpense(id);

      expect(await existeDespesa(setup, setup.mockCompanyId as string, id)).toBeFalse();
    });
  });

  describe('updateExpense() - campos de dominio nao mudam por patch (regra 7.1)', () => {
    it('[RED] aplica o campo editavel e mantem status, paidDate, origin, serie, parcela, legacy e createdAt', async () => {
      const id = await semearDespesa(setup, setup.mockCompanyId as string, {
        status: 'a_pagar',
        origin: 'recorrencia',
        seriesId: 'serie-original',
        installmentGroupId: 'grupo-original',
        installmentNumber: 2,
        installmentTotal: 5,
        legacyBillId: 'bill-original',
      });
      const despesaLida = (await lerDespesa(setup, id)) as Expense;

      // Patch vindo de variavel (nao literal): simula o caller que espalha a
      // despesa lida e altera tudo, inclusive campos de dominio.
      const patch = {
        ...despesaLida,
        description: 'nova',
        status: 'pago',
        paidDate: '2026-01-01',
        origin: 'migracao',
        seriesId: 'serie-patch',
        installmentGroupId: 'grupo-patch',
        installmentNumber: 9,
        installmentTotal: 9,
        legacyBillId: 'bill-patch',
        createdAt: Timestamp.fromMillis(0),
      } as any;

      await service.updateExpense(id, patch);

      const depois = await lerDespesa(setup, id);
      expect(depois?.description).withContext('campo editavel deve ser aplicado').toBe('nova');
      expect(depois?.status).withContext('status so muda por markAsPaid').toBe('a_pagar');
      expect(depois?.paidDate)
        .withContext('paidDate nao pode ser gravado pelo patch')
        .toBeUndefined();
      expect(depois?.origin).toBe('recorrencia');
      expect(depois?.seriesId).toBe('serie-original');
      expect(depois?.installmentGroupId).toBe('grupo-original');
      expect(depois?.installmentNumber).toBe(2);
      expect(depois?.installmentTotal).toBe(5);
      expect(depois?.legacyBillId).toBe('bill-original');
      expect(depois?.createdAt.toMillis())
        .withContext('createdAt nao pode ser sobrescrito')
        .toBe(despesaLida.createdAt.toMillis());
    });
  });

  describe('Regra: validacao de entrada (CRITICA, regras 7.1 e 7.2)', () => {
    describe('addExpense() - valor e data invalidos', () => {
      for (const valor of VALORES_INVALIDOS) {
        it(`[RED] rejeita value ${valor} e nao grava a despesa`, async () => {
          const descricao = `Invalida valor ${idUnico()}`;

          await expectRejeicaoDeRegra(() =>
            service.addExpense(novaDespesa({ description: descricao, value: valor })),
          );

          expect(await existeDespesaComDescricao(setup, setup.mockCompanyId as string, descricao))
            .withContext('nada deve ser gravado')
            .toBeFalse();
        });
      }

      for (const data of DATAS_INVALIDAS) {
        it(`[RED] rejeita dueDate '${data}' e nao grava a despesa`, async () => {
          const descricao = `Invalida data ${idUnico()}`;

          await expectRejeicaoDeRegra(() =>
            service.addExpense(novaDespesa({ description: descricao, dueDate: data })),
          );

          expect(await existeDespesaComDescricao(setup, setup.mockCompanyId as string, descricao))
            .withContext('nada deve ser gravado')
            .toBeFalse();
        });
      }
    });

    describe('updateExpense() - patch invalido', () => {
      for (const valor of [Number.NaN, -5, 0]) {
        it(`[RED] rejeita patch value ${valor} e mantem o valor original`, async () => {
          const id = await semearDespesa(setup, setup.mockCompanyId as string, { value: 100 });

          await expectRejeicaoDeRegra(() => service.updateExpense(id, { value: valor }));

          expect((await lerDespesa(setup, id))?.value).toBe(100);
        });
      }

      for (const data of DATAS_INVALIDAS) {
        it(`[RED] rejeita patch dueDate '${data}' e mantem o vencimento original`, async () => {
          const id = await semearDespesa(setup, setup.mockCompanyId as string, {
            dueDate: '2026-11-10',
          });

          await expectRejeicaoDeRegra(() => service.updateExpense(id, { dueDate: data }));

          expect((await lerDespesa(setup, id))?.dueDate).toBe('2026-11-10');
        });
      }
    });

    describe('markAsPaid() e markGoodsReceived() - data invalida', () => {
      it('[RED] markAsPaid rejeita paidDate 2026-02-30 e a despesa segue a_pagar', async () => {
        const id = await service.addExpense(novaDespesa());

        await expectRejeicaoDeRegra(() => service.markAsPaid(id, '2026-02-30'));

        const salva = await lerDespesa(setup, id);
        expect(salva?.status).toBe('a_pagar');
        expect(salva?.paidDate).toBeUndefined();
      });

      it('[RED] markGoodsReceived rejeita date 2026-02-30 e nao grava goodsReceivedDate', async () => {
        const id = await service.addExpense(novaDespesa());

        await expectRejeicaoDeRegra(() => service.markGoodsReceived(id, '2026-02-30'));

        expect((await lerDespesa(setup, id))?.goodsReceivedDate).toBeUndefined();
      });
    });

    describe('addExpense() - input sujo nao injeta campos de dominio', () => {
      it('[RED] descarta paidDate, seriesId, legacyBillId e installmentGroupId e forca status a_pagar e origin manual', async () => {
        const sujo = {
          ...novaDespesa(),
          paidDate: '2026-01-01',
          seriesId: 'serie-x',
          legacyBillId: 'bill-x',
          installmentGroupId: 'grupo-x',
          status: 'pago',
          origin: 'migracao',
        } as any;

        const id = await service.addExpense(sujo);

        const salva = await lerDespesa(setup, id);
        expect(salva?.status).toBe('a_pagar');
        expect(salva?.origin).toBe('manual');
        expect(salva?.paidDate).toBeUndefined();
        expect(salva?.seriesId).toBeUndefined();
        expect(salva?.legacyBillId).toBeUndefined();
        expect(salva?.installmentGroupId).toBeUndefined();
      });
    });

    describe('categoryId deve ser uma categoria da empresa da sessao', () => {
      it('[RED] addExpense rejeita categoria de outra empresa e nao grava', async () => {
        const outra = await setupSecondUserContext();
        try {
          const categoriaAlheia = await semearCategoriaDaEmpresa(
            outra,
            outra.mockCompanyId as string,
          );
          const descricao = `Categoria alheia ${idUnico()}`;

          await expectRejeicaoDeRegra(() =>
            service.addExpense(
              novaDespesa({ description: descricao, categoryId: categoriaAlheia }),
            ),
          );

          expect(
            await existeDespesaComDescricao(setup, setup.mockCompanyId as string, descricao),
          ).toBeFalse();
        } finally {
          await outra.cleanup();
        }
      });

      it('[RED] addExpense rejeita categoryId inexistente e nao grava', async () => {
        const descricao = `Categoria inexistente ${idUnico()}`;

        await expectRejeicaoDeRegra(() =>
          service.addExpense(
            novaDespesa({ description: descricao, categoryId: `cat-${idUnico()}` }),
          ),
        );

        expect(
          await existeDespesaComDescricao(setup, setup.mockCompanyId as string, descricao),
        ).toBeFalse();
      });

      it('[RED] addInstallments rejeita categoria de outra empresa e nao grava nenhuma parcela', async () => {
        const outra = await setupSecondUserContext();
        try {
          const categoriaAlheia = await semearCategoriaDaEmpresa(
            outra,
            outra.mockCompanyId as string,
          );
          const descricao = `Parcela alheia ${idUnico()}`;

          await expectRejeicaoDeRegra(() =>
            service.addInstallments(
              novaDespesa({ description: descricao, value: 100, categoryId: categoriaAlheia }),
              3,
            ),
          );

          expect(
            await existeDespesaComDescricao(setup, setup.mockCompanyId as string, descricao),
          ).toBeFalse();
        } finally {
          await outra.cleanup();
        }
      });

      it('[RED] addInstallments rejeita categoryId inexistente e nao grava nenhuma parcela', async () => {
        const descricao = `Parcela inexistente ${idUnico()}`;

        await expectRejeicaoDeRegra(() =>
          service.addInstallments(
            novaDespesa({ description: descricao, value: 100, categoryId: `cat-${idUnico()}` }),
            3,
          ),
        );

        expect(
          await existeDespesaComDescricao(setup, setup.mockCompanyId as string, descricao),
        ).toBeFalse();
      });
    });
  });

  describe('Regra: escrita exige companyId da sessao (CRITICA)', () => {
    let semEmpresa: EmulatorTestSetup;
    let servicoSemEmpresa: ExpenseService;

    beforeEach(async () => {
      semEmpresa = await setupFirestoreEmulatorTest(null);
      servicoSemEmpresa = configurarServico(semEmpresa);
    });

    afterEach(async () => {
      await semEmpresa.cleanup();
    });

    const escritas: Array<[string, (s: ExpenseService) => Promise<unknown>]> = [
      ['addExpense', (s) => s.addExpense(novaDespesa())],
      ['addInstallments', (s) => s.addInstallments(novaDespesa(), 3)],
      ['markAsPaid', (s) => s.markAsPaid('id-qualquer', '2026-10-22')],
      ['markGoodsReceived', (s) => s.markGoodsReceived('id-qualquer', '2026-10-22')],
      ['updateExpense', (s) => s.updateExpense('id-qualquer', { description: 'Novo' })],
      ['deleteExpense', (s) => s.deleteExpense('id-qualquer')],
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
