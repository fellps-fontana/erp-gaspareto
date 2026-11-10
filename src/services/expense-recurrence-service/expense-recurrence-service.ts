import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  collection,
  doc,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  Transaction,
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
import {
  assertCategoriaAtiva,
  COLECAO_DESPESAS,
  COLECAO_SERIES,
  ehNegacaoDePermissao,
  exigirCompanyId,
  lerCategoriaDaEmpresa,
} from '../expense-firestore-guards/expense-firestore-guards';
import {
  assertDateKey,
  assertExpenseValue,
  assertRecurrencePeriod,
  stripUndefined,
} from '../expense-validation/expense-validation';
import { FirestoreBaseService } from '../firestore-base.service';
import { TenantService } from '../tenant-service/tenant-service';

export interface RecurrenceRunResult {
  generated: number;
  seriesProcessed: number;
}

export interface FalhaDeSerie {
  seriesId: string;
  message: string;
}

/**
 * Catch-up com falhas parciais: `partial` traz o que foi gerado nas series que deram certo;
 * `failures` lista as series que falharam.
 */
export class RecurrenceCatchUpError extends Error {
  constructor(
    readonly partial: RecurrenceRunResult,
    readonly failures: FalhaDeSerie[],
  ) {
    super(mensagemDeFalhas(failures));
    this.name = 'RecurrenceCatchUpError';
  }
}

const STATUS_A_PAGAR: ExpenseStatus = 'a_pagar';
const ORIGEM_RECORRENCIA: ExpenseOrigin = 'recorrencia';

const LIMITE_ESCRITAS_POR_TRANSACAO = 400;
// Uma escrita por transacao e reservada para avancar generatedThrough.
const OCORRENCIAS_POR_TRANSACAO = LIMITE_ESCRITAS_POR_TRANSACAO - 1;
const MESES_MAXIMOS_ANCORA_PASSADA = 24;

const MSG_SEM_EMPRESA = 'Não é possível operar recorrências sem uma empresa (companyId) associada.';
const MSG_EMPRESA_DIVERGENTE = 'Só é possível operar recorrências da empresa da sessão atual.';
const MSG_SERIE_NAO_ENCONTRADA = 'Série não encontrada nesta empresa.';
const MSG_SERIE_JA_ENCERRADA = 'Série já está encerrada.';
const MSG_ANCORA_ANTIGA = 'Data da recorrência mais de 24 meses no passado. Ajuste a data.';

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

  /**
   * Cria a serie + a 1a ocorrencia (id deterministico) e marca generatedThrough = dueDate.
   * Rejeita data com mais de 24 meses antes de `today` e data fora de 2000..2100.
   */
  async createSeries(
    input: NewExpenseInput,
    period: ExpenseRecurrencePeriod,
    today: DateKey,
  ): Promise<{ seriesId: string; firstExpenseId: string }> {
    const companyId = this.companyIdDaSessao();
    assertExpenseValue(input.value);
    assertDateKey(input.dueDate, 'dueDate');
    assertAncoraNaoAntiga(input.dueDate, today);
    assertRecurrencePeriod(period);
    assertCategoriaAtiva(await lerCategoriaDaEmpresa(this.firestore, companyId, input.categoryId));

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

  /** active=false + endedAt; ocorrencias ja geradas ficam. Lanca se a serie nao e da empresa ou ja encerrada. */
  async endSeries(seriesId: string): Promise<void> {
    const companyId = this.companyIdDaSessao();
    const serieRef = doc(this.firestore, COLECAO_SERIES, seriesId);

    await runTransaction(this.firestore, async (transacao) => {
      const serie = await this.lerSerieDaEmpresa(transacao, serieRef, companyId);
      if (!serie.active) {
        throw new Error(MSG_SERIE_JA_ENCERRADA);
      }
      transacao.update(serieRef, { active: false, endedAt: serverTimestamp() });
    });
  }

  /**
   * Catch-up (D2): por serie ativa da empresa, em runTransaction sobre o doc da
   * serie: gera as ocorrencias > generatedThrough ate endOfMonth(today), no maximo
   * 1 lote (OCORRENCIAS_POR_TRANSACAO) por serie por chamada; o restante fica para
   * a proxima. Grava com id deterministico e avanca generatedThrough. Idempotente.
   * Revalida o template antes de gerar. Processa todas as series; falhas sao
   * acumuladas e lancadas no fim. Lanca se companyId vazio ou diferente da sessao.
   */
  async generateDueOccurrences(companyId: string, today: DateKey): Promise<RecurrenceRunResult> {
    const empresa = exigirCompanyId(companyId, MSG_SEM_EMPRESA);
    if (empresa !== this.companyIdDaSessao()) {
      throw new Error(MSG_EMPRESA_DIVERGENTE);
    }
    assertDateKey(today, 'today');
    const limiteDoMes = ExpenseScheduleService.endOfMonth(today);
    const seriesAtivas = await getDocs(
      query(
        collection(this.firestore, COLECAO_SERIES),
        where('companyId', '==', empresa),
        where('active', '==', true),
      ),
    );

    let geradas = 0;
    const falhas: FalhaDeSerie[] = [];
    for (const serie of seriesAtivas.docs) {
      try {
        geradas += await this.gerarLoteDaSerie(serie.id, empresa, limiteDoMes);
      } catch (erro) {
        falhas.push({ seriesId: serie.id, message: mensagemDe(erro) });
      }
    }
    const resultado: RecurrenceRunResult = {
      generated: geradas,
      seriesProcessed: seriesAtivas.size,
    };
    if (falhas.length > 0) {
      throw new RecurrenceCatchUpError(resultado, falhas);
    }
    return resultado;
  }

  private companyIdDaSessao(): string {
    return exigirCompanyId(this.tenantService.companyId(), MSG_SEM_EMPRESA);
  }

  /** Leitura transacional da serie; inexistente ou de outra empresa vira mensagem de dominio. */
  private async lerSerieDaEmpresa(
    transacao: Transaction,
    serieRef: DocumentReference,
    companyId: string,
  ): Promise<ExpenseSeries> {
    let serie: ExpenseSeries | undefined;
    try {
      serie = serieDoSnapshot(await transacao.get(serieRef));
    } catch (erro) {
      if (!ehNegacaoDePermissao(erro)) {
        throw erro;
      }
    }
    if (serie === undefined || serie.companyId !== companyId) {
      throw new Error(MSG_SERIE_NAO_ENCONTRADA);
    }
    return serie;
  }

  /** Revalida o template da serie (valor e categoria da empresa; arquivada e aceita). */
  private async assertTemplateValido(
    template: ExpenseSeriesTemplate,
    companyId: string,
  ): Promise<void> {
    assertExpenseValue(template.value);
    await lerCategoriaDaEmpresa(this.firestore, companyId, template.categoryId);
  }

  /** Uma transacao: gera no maximo OCORRENCIAS_POR_TRANSACAO e avanca generatedThrough na mesma escrita. */
  private gerarLoteDaSerie(
    seriesId: string,
    companyId: string,
    limiteDoMes: DateKey,
  ): Promise<number> {
    const serieRef = doc(this.firestore, COLECAO_SERIES, seriesId);
    return runTransaction(this.firestore, async (transacao) => {
      const serie = await this.lerSerieDaEmpresa(transacao, serieRef, companyId);
      if (!serie.active) {
        return 0;
      }
      assertDateKey(serie.anchorDate, 'anchorDate');
      await this.assertTemplateValido(serie.template, companyId);

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
      return lote.length;
    });
  }
}

function assertAncoraNaoAntiga(dueDate: DateKey, today: DateKey): void {
  assertDateKey(today, 'today');
  const limite = ExpenseScheduleService.addMonthsClamped(today, -MESES_MAXIMOS_ANCORA_PASSADA);
  if (dueDate < limite) {
    throw new Error(MSG_ANCORA_ANTIGA);
  }
}

function serieDoSnapshot(snap: DocumentSnapshot): ExpenseSeries | undefined {
  return snap.data() as ExpenseSeries | undefined;
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

function mensagemDeFalhas(falhas: FalhaDeSerie[]): string {
  const detalhes = falhas.map((f) => `${f.seriesId} (${f.message})`).join('; ');
  return `Falha ao gerar recorrências em ${falhas.length} série(s): ${detalhes}. As demais séries foram processadas.`;
}

function templateDe(input: NewExpenseInput): ExpenseSeriesTemplate {
  return stripUndefined({
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

// Ocorrencia nasce a_pagar, origin=recorrencia, com os campos do template da serie.
function montarOcorrencia(
  template: ExpenseSeriesTemplate,
  companyId: string,
  seriesId: string,
  dueDate: DateKey,
): DocumentData {
  return stripUndefined({
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
