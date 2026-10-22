import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  getDoc,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import {
  DateKey,
  Expense,
  ExpenseCategory,
  ExpenseOrigin,
  ExpenseStatus,
  NewExpenseInput,
} from '../../models/expense-model';
import { PaymentMethod } from '../../models/sell-model';
import { ExpenseScheduleService } from '../expense-schedule-service/expense-schedule-service';
import {
  assertDateKey,
  assertExpenseValue,
  omitFields,
  stripUndefined,
} from '../expense-validation/expense-validation';
import { FirestoreBaseService } from '../firestore-base.service';
import { TenantService } from '../tenant-service/tenant-service';

const STATUS_A_PAGAR: ExpenseStatus = 'a_pagar';
const STATUS_PAGO: ExpenseStatus = 'pago';
const ORIGEM_MANUAL: ExpenseOrigin = 'manual';
const ORIGEM_PARCELAMENTO: ExpenseOrigin = 'parcelamento';
const COLECAO_CATEGORIAS = 'expenseCategories';
const CODIGO_PERMISSAO_NEGADA = 'permission-denied';

const MSG_SEM_EMPRESA =
  'Não é possível salvar despesa sem uma empresa (companyId) associada à sessão atual.';
const MSG_DESPESA_NAO_ENCONTRADA = 'Despesa não encontrada nesta empresa.';
const MSG_DESPESA_JA_PAGA = 'Despesa já está paga; não é possível registrar pagamento de novo.';
const MSG_CATEGORIA_INVALIDA = 'Categoria inválida para esta empresa.';
const MSG_CATEGORIA_ARQUIVADA = 'Categoria arquivada não pode ser usada em nova despesa.';

/** Campos de dominio que nunca mudam por patch ou por input: status so por markAsPaid, proveniencia e vinculos fixos. */
const CAMPOS_PROTEGIDOS_NO_UPDATE: ReadonlySet<string> = new Set([
  'id',
  'companyId',
  'createdAt',
  'status',
  'paidDate',
  'origin',
  'seriesId',
  'installmentGroupId',
  'installmentNumber',
  'installmentTotal',
  'legacyBillId',
]);

@Injectable({ providedIn: 'root' })
export class ExpenseService extends FirestoreBaseService {
  private firestore = inject(Firestore);
  private tenantService = inject(TenantService);
  private readonly COL = 'expenses';

  /** where(companyId) + orderBy(dueDate desc). */
  getExpenses(): Observable<Expense[]> {
    const q = query(
      collection(this.firestore, this.COL),
      where('companyId', '==', this.tenantService.companyId()),
      orderBy('dueDate', 'desc'),
    );
    return this.collectionDataObservable<Expense>(q);
  }

  /** Todas as escritas lancam se companyId() for nulo. Retorna o id. */
  async addExpense(input: NewExpenseInput): Promise<string> {
    const companyId = this.companyIdDaSessao();
    validarValorEVencimento(input);
    await this.assertCategoriaAtiva(input.categoryId, companyId);
    const ref = await addDoc(
      collection(this.firestore, this.COL),
      this.montarDespesa(input, companyId, ORIGEM_MANUAL),
    );
    return ref.id;
  }

  /** Batch atomico de N despesas (ExpenseScheduleService.buildInstallments); retorna os ids. */
  async addInstallments(input: NewExpenseInput, count: number): Promise<string[]> {
    const companyId = this.companyIdDaSessao();
    validarValorEVencimento(input);
    const parcelas = ExpenseScheduleService.buildInstallments(
      Number(input.value),
      count,
      input.dueDate,
    );
    await this.assertCategoriaAtiva(input.categoryId, companyId);
    const installmentGroupId = doc(collection(this.firestore, this.COL)).id;

    const lote = writeBatch(this.firestore);
    const ids = parcelas.map((parcela) => {
      const ref = doc(collection(this.firestore, this.COL));
      lote.set(
        ref,
        this.montarDespesa(input, companyId, ORIGEM_PARCELAMENTO, {
          dueDate: parcela.dueDate,
          value: parcela.value,
          installmentGroupId,
          installmentNumber: parcela.installmentNumber,
          installmentTotal: parcela.installmentTotal,
        }),
      );
      return ref.id;
    });
    await lote.commit();
    return ids;
  }

  /** runTransaction: a_pagar -> pago; lanca se ja pago ou inexistente. */
  async markAsPaid(id: string, paidDate: DateKey, paymentMethod?: PaymentMethod): Promise<void> {
    const companyId = this.companyIdDaSessao();
    assertDateKey(paidDate, 'paidDate');
    const ref = doc(this.firestore, this.COL, id);
    await runTransaction(this.firestore, async (transacao) => {
      const despesa = despesaDaEmpresaOuLancar(await transacao.get(ref), companyId);
      if (despesa.status === STATUS_PAGO) {
        throw new Error(MSG_DESPESA_JA_PAGA);
      }
      transacao.update(ref, stripUndefined({ status: STATUS_PAGO, paidDate, paymentMethod }));
    });
  }

  async markGoodsReceived(id: string, date: DateKey): Promise<void> {
    const companyId = this.companyIdDaSessao();
    assertDateKey(date, 'date');
    const ref = doc(this.firestore, this.COL, id);
    await this.lerDespesaDaEmpresa(ref, companyId);
    await updateDoc(ref, { goodsReceivedDate: date });
  }

  async updateExpense(
    id: string,
    patch: Partial<Omit<Expense, 'id' | 'companyId' | 'createdAt' | 'status' | 'paidDate'>>,
  ): Promise<void> {
    const companyId = this.companyIdDaSessao();
    validarPatch(patch);
    const ref = doc(this.firestore, this.COL, id);
    const atual = await this.lerDespesaDaEmpresa(ref, companyId);
    if (patch.categoryId !== undefined && patch.categoryId !== atual.categoryId) {
      await this.assertCategoriaExiste(patch.categoryId, companyId);
    }
    const editaveis = omitFields(
      { ...patch, value: converterValorOpcional(patch.value) },
      CAMPOS_PROTEGIDOS_NO_UPDATE,
    );
    await updateDoc(ref, stripUndefined(editaveis));
  }

  async deleteExpense(id: string): Promise<void> {
    const companyId = this.companyIdDaSessao();
    const ref = doc(this.firestore, this.COL, id);
    await this.lerDespesaDaEmpresa(ref, companyId);
    await deleteDoc(ref);
  }

  private companyIdDaSessao(): string {
    const companyId = this.tenantService.companyId();
    if (!companyId) {
      throw new Error(MSG_SEM_EMPRESA);
    }
    return companyId;
  }

  /**
   * Doc inexistente nao chega ao guard: a rule nega a leitura (resource nulo) antes.
   * O guard e defesa em profundidade contra doc de outra empresa.
   */
  private async lerDespesaDaEmpresa(ref: DocumentReference, companyId: string): Promise<Expense> {
    return despesaDaEmpresaOuLancar(await getDoc(ref), companyId);
  }

  /** Categoria nova so aceita categoria ativa (nao arquivada) da empresa da sessao. */
  private async assertCategoriaAtiva(categoryId: string, companyId: string): Promise<void> {
    const categoria = await this.lerCategoriaDaEmpresa(categoryId, companyId);
    if (categoria.archived) {
      throw new Error(MSG_CATEGORIA_ARQUIVADA);
    }
  }

  /** Despesa existente pode manter categoria arquivada; so exige que a categoria seja da empresa. */
  private async assertCategoriaExiste(categoryId: string, companyId: string): Promise<void> {
    await this.lerCategoriaDaEmpresa(categoryId, companyId);
  }

  /**
   * Categoria inexistente ou de outra empresa e negada pela rule (permission-denied):
   * vira mensagem de dominio. Outros erros de leitura seguem para quem chamou.
   */
  private async lerCategoriaDaEmpresa(
    categoryId: string,
    companyId: string,
  ): Promise<ExpenseCategory> {
    let categoria: ExpenseCategory | undefined;
    if (categoryId) {
      try {
        const snap = await getDoc(doc(this.firestore, COLECAO_CATEGORIAS, categoryId));
        categoria = snap.data() as ExpenseCategory | undefined;
      } catch (erro) {
        if (!ehNegacaoDePermissao(erro)) {
          throw erro;
        }
      }
    }
    if (categoria === undefined || categoria.companyId !== companyId) {
      throw new Error(MSG_CATEGORIA_INVALIDA);
    }
    return categoria;
  }

  private montarDespesa(
    input: NewExpenseInput,
    companyId: string,
    origem: ExpenseOrigin,
    campos: Partial<Expense> = {},
  ): DocumentData {
    return stripUndefined({
      ...omitFields(input, CAMPOS_PROTEGIDOS_NO_UPDATE),
      value: Number(input.value),
      companyId,
      status: STATUS_A_PAGAR,
      origin: origem,
      createdAt: serverTimestamp(),
      ...campos,
    });
  }
}

function validarValorEVencimento(input: NewExpenseInput): void {
  assertExpenseValue(input.value);
  assertDateKey(input.dueDate, 'dueDate');
}

/** Valida apenas os campos presentes no patch. */
function validarPatch(patch: Partial<NewExpenseInput>): void {
  if (patch.value !== undefined) {
    assertExpenseValue(patch.value);
  }
  if (patch.dueDate !== undefined) {
    assertDateKey(patch.dueDate, 'dueDate');
  }
}

function despesaDaEmpresaOuLancar(snap: DocumentSnapshot, companyId: string): Expense {
  const despesa = snap.data() as Expense | undefined;
  if (despesa === undefined || despesa.companyId !== companyId) {
    throw new Error(MSG_DESPESA_NAO_ENCONTRADA);
  }
  return despesa;
}

function converterValorOpcional(valor: number | undefined): number | undefined {
  return valor === undefined ? undefined : Number(valor);
}

function ehNegacaoDePermissao(erro: unknown): boolean {
  return (erro as { code?: unknown } | null)?.code === CODIGO_PERMISSAO_NEGADA;
}
