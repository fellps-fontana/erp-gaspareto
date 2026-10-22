import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  collection,
  doc,
  DocumentData,
  DocumentSnapshot,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import {
  DateKey,
  ExpenseOrigin,
  ExpenseRecurrencePeriod,
  ExpenseSeries,
  ExpenseSeriesTemplate,
  ExpenseStatus,
  NewExpenseInput,
} from '../../models/expense-model';
import { ExpenseScheduleService } from '../expense-schedule-service/expense-schedule-service';
import { FirestoreBaseService } from '../firestore-base.service';
import { TenantService } from '../tenant-service/tenant-service';

export interface RecurrenceRunResult {
  generated: number;
  seriesProcessed: number;
}

interface LoteGerado {
  geradas: number;
  restamPendencias: boolean;
}

const COLECAO_SERIES = 'expenseSeries';
const COLECAO_DESPESAS = 'expenses';
const STATUS_A_PAGAR: ExpenseStatus = 'a_pagar';
const ORIGEM_RECORRENCIA: ExpenseOrigin = 'recorrencia';

const LIMITE_ESCRITAS_POR_TRANSACAO = 400;
// Uma escrita por transacao e reservada para avancar generatedThrough.
const OCORRENCIAS_POR_TRANSACAO = LIMITE_ESCRITAS_POR_TRANSACAO - 1;
const LOTE_VAZIO: LoteGerado = { geradas: 0, restamPendencias: false };

const MSG_SEM_EMPRESA = 'Não é possível operar recorrências sem uma empresa (companyId) associada.';

@Injectable({ providedIn: 'root' })
export class ExpenseRecurrenceService extends FirestoreBaseService {
  private firestore = inject(Firestore);
  private tenantService = inject(TenantService);

  /** where(companyId) + where(active == true). */
  getSeries(): Observable<ExpenseSeries[]> {
    const q = query(
      collection(this.firestore, COLECAO_SERIES),
      where('companyId', '==', this.companyIdDaSessao()),
      where('active', '==', true),
    );
    return this.collectionDataObservable<ExpenseSeries>(q);
  }

  /** Cria a serie + a 1ª ocorrencia (id deterministico) e marca generatedThrough = dueDate. */
  async createSeries(
    input: NewExpenseInput,
    period: ExpenseRecurrencePeriod,
  ): Promise<{ seriesId: string; firstExpenseId: string }> {
    const companyId = this.companyIdDaSessao();
    const serieRef = doc(collection(this.firestore, COLECAO_SERIES));
    const seriesId = serieRef.id;
    const firstExpenseId = ExpenseScheduleService.occurrenceId(seriesId, input.dueDate);
    const template = templateDe(input);

    await runTransaction(this.firestore, async (transacao) => {
      transacao.set(serieRef, montarSerie(companyId, period, input.dueDate, template));
      transacao.set(
        doc(this.firestore, COLECAO_DESPESAS, firstExpenseId),
        montarOcorrencia(template, companyId, seriesId, input.dueDate),
      );
    });
    return { seriesId, firstExpenseId };
  }

  /** active=false + endedAt; ocorrencias ja geradas ficam. */
  async endSeries(seriesId: string): Promise<void> {
    this.companyIdDaSessao();
    await updateDoc(doc(this.firestore, COLECAO_SERIES, seriesId), {
      active: false,
      endedAt: serverTimestamp(),
    });
  }

  /**
   * Catch-up (D2): por serie ativa da empresa, em runTransaction sobre o doc da
   * serie: gera TODAS as ocorrencias > generatedThrough ate endOfMonth(today),
   * grava com id deterministico e avanca generatedThrough. Idempotente.
   * Lanca se companyId vazio.
   */
  async generateDueOccurrences(companyId: string, today: DateKey): Promise<RecurrenceRunResult> {
    const empresa = companyIdObrigatorio(companyId);
    const limiteDoMes = ExpenseScheduleService.endOfMonth(today);
    const seriesAtivas = await getDocs(
      query(
        collection(this.firestore, COLECAO_SERIES),
        where('companyId', '==', empresa),
        where('active', '==', true),
      ),
    );

    let geradas = 0;
    for (const serie of seriesAtivas.docs) {
      geradas += await this.gerarOcorrenciasDaSerie(serie.id, empresa, limiteDoMes);
    }
    return { generated: geradas, seriesProcessed: seriesAtivas.size };
  }

  private companyIdDaSessao(): string {
    return companyIdObrigatorio(this.tenantService.companyId());
  }

  /** Repete transacoes de lote ate nao restar ocorrencia pendente na serie. */
  private async gerarOcorrenciasDaSerie(
    seriesId: string,
    companyId: string,
    limiteDoMes: DateKey,
  ): Promise<number> {
    let geradas = 0;
    let restamPendencias = true;
    while (restamPendencias) {
      const lote = await this.gerarLoteDaSerie(seriesId, companyId, limiteDoMes);
      geradas += lote.geradas;
      restamPendencias = lote.restamPendencias;
    }
    return geradas;
  }

  /** Uma transacao: gera ate OCORRENCIAS_POR_TRANSACAO e avanca generatedThrough na mesma escrita. */
  private gerarLoteDaSerie(
    seriesId: string,
    companyId: string,
    limiteDoMes: DateKey,
  ): Promise<LoteGerado> {
    const serieRef = doc(this.firestore, COLECAO_SERIES, seriesId);
    return runTransaction(this.firestore, async (transacao) => {
      const serie = serieDaEmpresaAtivaOuNull(await transacao.get(serieRef), companyId);
      if (serie === null) {
        return LOTE_VAZIO;
      }

      const pendentes = ExpenseScheduleService.occurrenceDates(
        serie.anchorDate,
        serie.period,
        serie.generatedThrough ?? null,
        limiteDoMes,
      );
      const lote = pendentes.slice(0, OCORRENCIAS_POR_TRANSACAO);
      for (const dueDate of lote) {
        transacao.set(
          doc(
            this.firestore,
            COLECAO_DESPESAS,
            ExpenseScheduleService.occurrenceId(seriesId, dueDate),
          ),
          montarOcorrencia(serie.template, companyId, seriesId, dueDate),
        );
      }
      if (lote.length > 0) {
        transacao.update(serieRef, { generatedThrough: lote[lote.length - 1] });
      }
      return { geradas: lote.length, restamPendencias: pendentes.length > lote.length };
    });
  }
}

function companyIdObrigatorio(companyId: string | null | undefined): string {
  if (!companyId) {
    throw new Error(MSG_SEM_EMPRESA);
  }
  return companyId;
}

function serieDaEmpresaAtivaOuNull(
  snap: DocumentSnapshot,
  companyId: string,
): ExpenseSeries | null {
  const serie = snap.data() as ExpenseSeries | undefined;
  if (serie === undefined || serie.companyId !== companyId || !serie.active) {
    return null;
  }
  return serie;
}

function templateDe(input: NewExpenseInput): ExpenseSeriesTemplate {
  return semCamposIndefinidos({
    description: input.description,
    value: Number(input.value),
    categoryId: input.categoryId,
    supplier: input.supplier,
    paymentMethod: input.paymentMethod,
    notes: input.notes,
  }) as ExpenseSeriesTemplate;
}

function montarSerie(
  companyId: string,
  period: ExpenseRecurrencePeriod,
  dueDate: DateKey,
  template: ExpenseSeriesTemplate,
): DocumentData {
  return {
    companyId,
    active: true,
    period,
    anchorDate: dueDate,
    generatedThrough: dueDate,
    template,
    createdAt: serverTimestamp(),
  };
}

/** Ocorrencia nasce a_pagar, origin=recorrencia, com os campos do template da serie. */
function montarOcorrencia(
  template: ExpenseSeriesTemplate,
  companyId: string,
  seriesId: string,
  dueDate: DateKey,
): DocumentData {
  return semCamposIndefinidos({
    description: template.description,
    value: Number(template.value),
    categoryId: template.categoryId,
    supplier: template.supplier,
    paymentMethod: template.paymentMethod,
    notes: template.notes,
    companyId,
    dueDate,
    status: STATUS_A_PAGAR,
    origin: ORIGEM_RECORRENCIA,
    seriesId,
    createdAt: serverTimestamp(),
  });
}

/** Firestore recusa valores undefined; campos opcionais ausentes saem do documento. */
function semCamposIndefinidos(dados: DocumentData): DocumentData {
  return Object.fromEntries(Object.entries(dados).filter(([, valor]) => valor !== undefined));
}
