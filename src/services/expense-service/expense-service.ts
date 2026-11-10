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
  ExpenseOrigin,
  ExpenseStatus,
  NewExpenseInput,
} from '../../models/expense-model';
import { PaymentMethod } from '../../models/sell-model';
import { ExpenseScheduleService } from '../expense-schedule-service/expense-schedule-service';
import {
  assertCategoriaAtiva,
  COLECAO_DESPESAS,
  exigirCompanyId,
  lerCategoriaDaEmpresa,
} from '../expense-firestore-guards/expense-firestore-guards';
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

const MSG_SEM_EMPRESA =
  'Não é possível salvar despesa sem uma empresa (companyId) associada à sessão atual.';
const MSG_DESPESA_NAO_ENCONTRADA = 'Despesa não encontrada nesta empresa.';
const MSG_DESPESA_JA_PAGA = 'Despesa já está paga; não é possível registrar pagamento de novo.';

/**
 * Campos de dominio gerenciados pelo service: nunca vem do caller, nem na criacao nem no update.
 * Status so muda por markAsPaid; proveniencia e vinculos fixos.
 */
const CAMPOS_GERENCIADOS_PELO_SERVICE: ReadonlySet<string> = new Set([
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

  /** where(companyId) + orderBy(dueDate desc). */
  getExpenses(): Observable<Expense[]> {
    const q = query(
      collection(this.firestore, COLECAO_DESPESAS),
      where('companyId', '==', this.tenantService.companyId()),
      orderBy('dueDate', 'desc'),
    );
    return this.collectionDataObservable<Expense>(q);
  }

  /** Todas as escritas lancam se companyId() for nulo. Retorna o id. */
  async addExpense(input: NewExpenseInput): Promise<string> {
    const companyId = this.companyIdDaSessao();
    validarCamposDeCriacao(input);
    await this.assertCategoriaAtivaDaEmpresa(input.categoryId, companyId);
    const ref = await addDoc(
      collection(this.firestore, COLECAO_DESPESAS),
      this.montarDespesa(input, companyId, ORIGEM_MANUAL),
    );
    return ref.id;
  }

  /** Batch atomico de N despesas (ExpenseScheduleService.buildInstallments); retorna os ids. */
  async addInstallments(input: NewExpenseInput, count: number): Promise<string[]> {
    const companyId = this.companyIdDaSessao();
    validarCamposDeCriacao(input);
    const parcelas = ExpenseScheduleService.buildInstallments(
      Number(input.value),
      count,
      input.dueDate,
    );
    await this.assertCategoriaAtivaDaEmpresa(input.categoryId, companyId);
    const installmentGroupId = doc(collection(this.firestore, COLECAO_DESPESAS)).id;

    const lote = writeBatch(this.firestore);
    const ids = parcelas.map((parcela) => {
      const ref = doc(collection(this.firestore, COLECAO_DESPESAS));
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
    const ref = doc(this.firestore, COLECAO_DESPESAS, id);
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
    const ref = doc(this.firestore, COLECAO_DESPESAS, id);
    await this.lerDespesaDaEmpresa(ref, companyId);
    await updateDoc(ref, { goodsReceivedDate: date });
  }

  async updateExpense(
    id: string,
    patch: Partial<Omit<Expense, 'id' | 'companyId' | 'createdAt' | 'status' | 'paidDate'>>,
  ): Promise<void> {
    const companyId = this.companyIdDaSessao();
    validarPatch(patch);
    const ref = doc(this.firestore, COLECAO_DESPESAS, id);
    const atual = await this.lerDespesaDaEmpresa(ref, companyId);
    if (patch.categoryId !== undefined && patch.categoryId !== atual.categoryId) {
      await lerCategoriaDaEmpresa(this.firestore, companyId, patch.categoryId);
    }
    const editaveis = omitFields(
      { ...patch, value: converterValorOpcional(patch.value) },
      CAMPOS_GERENCIADOS_PELO_SERVICE,
    );
    await updateDoc(ref, stripUndefined(editaveis));
  }

  async deleteExpense(id: string): Promise<void> {
    const companyId = this.companyIdDaSessao();
    const ref = doc(this.firestore, COLECAO_DESPESAS, id);
    await this.lerDespesaDaEmpresa(ref, companyId);
    await deleteDoc(ref);
  }

  private companyIdDaSessao(): string {
    return exigirCompanyId(this.tenantService.companyId(), MSG_SEM_EMPRESA);
  }

  /**
   * Doc inexistente nao chega ao guard: a rule nega a leitura (resource nulo) antes.
   * O guard e defesa em profundidade contra doc de outra empresa.
   */
  private async lerDespesaDaEmpresa(ref: DocumentReference, companyId: string): Promise<Expense> {
    return despesaDaEmpresaOuLancar(await getDoc(ref), companyId);
  }

  /** Categoria nova so aceita categoria ativa (nao arquivada) da empresa da sessao. */
  private async assertCategoriaAtivaDaEmpresa(
    categoryId: string,
    companyId: string,
  ): Promise<void> {
    assertCategoriaAtiva(await lerCategoriaDaEmpresa(this.firestore, companyId, categoryId));
  }

  private montarDespesa(
    input: NewExpenseInput,
    companyId: string,
    origem: ExpenseOrigin,
    campos: Partial<Expense> = {},
  ): DocumentData {
    return stripUndefined({
      ...omitFields(input, CAMPOS_GERENCIADOS_PELO_SERVICE),
      value: Number(input.value),
      companyId,
      status: STATUS_A_PAGAR,
      origin: origem,
      createdAt: serverTimestamp(),
      ...campos,
    });
  }
}

function validarCamposDeCriacao(input: NewExpenseInput): void {
  assertExpenseValue(input.value);
  assertDateKey(input.dueDate, 'dueDate');
  validarGoodsReceivedDate(input);
}

/** Valida apenas os campos presentes no patch. */
function validarPatch(patch: Partial<NewExpenseInput>): void {
  if (patch.value !== undefined) {
    assertExpenseValue(patch.value);
  }
  if (patch.dueDate !== undefined) {
    assertDateKey(patch.dueDate, 'dueDate');
  }
  validarGoodsReceivedDate(patch);
}

/** goodsReceivedDate e opcional; quando presente precisa ser data valida. */
function validarGoodsReceivedDate(campos: { goodsReceivedDate?: DateKey }): void {
  if (campos.goodsReceivedDate !== undefined) {
    assertDateKey(campos.goodsReceivedDate, 'goodsReceivedDate');
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
