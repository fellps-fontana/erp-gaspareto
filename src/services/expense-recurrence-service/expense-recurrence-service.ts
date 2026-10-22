import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  collection,
  doc,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  getDoc,
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
  ExpenseCategory,
  ExpenseOrigin,
  ExpenseRecurrencePeriod,
  ExpenseSeries,
  ExpenseSeriesTemplate,
  ExpenseStatus,
  NewExpenseInput,
} from '../../models/expense-model';
import { ExpenseScheduleService } from '../expense-schedule-service/expense-schedule-service';
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

interface FalhaDeSerie {
  seriesId: string;
  motivo: string;
}

const COLECAO_SERIES = 'expenseSeries';
const COLECAO_DESPESAS = 'expenses';
const COLECAO_CATEGORIAS = 'expenseCategories';
const STATUS_A_PAGAR: ExpenseStatus = 'a_pagar';
const ORIGEM_RECORRENCIA: ExpenseOrigin = 'recorrencia';
const CODIGO_PERMISSAO_NEGADA = 'permission-denied';

const LIMITE_ESCRITAS_POR_TRANSACAO = 400;
// Uma escrita por transacao e reservada para avancar generatedThrough.
const OCORRENCIAS_POR_TRANSACAO = LIMITE_ESCRITAS_POR_TRANSACAO - 1;
const MESES_MAXIMOS_ANCORA_PASSADA = 24;
const ANO_MINIMO_DATA = 2000;
const ANO_MAXIMO_DATA = 2100;

const MSG_SEM_EMPRESA = 'Não é possível operar recorrências sem uma empresa (companyId) associada.';
const MSG_EMPRESA_DIVERGENTE = 'Só é possível operar recorrências da empresa da sessão atual.';
const MSG_SERIE_NAO_ENCONTRADA = 'Série não encontrada nesta empresa.';
const MSG_SERIE_JA_ENCERRADA = 'Série já está encerrada.';
const MSG_CATEGORIA_INVALIDA = 'Categoria inválida para esta empresa.';
const MSG_CATEGORIA_ARQUIVADA = 'Categoria arquivada não pode ser usada em nova despesa.';
const MSG_ANCORA_ANTIGA = 'Data da recorrência mais de 24 meses no passado. Ajuste a data.';
const MSG_DATA_FORA_DA_FAIXA = 'Data fora da faixa permitida (ano entre 2000 e 2100).';

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
    assertDataDeNegocio(input.dueDate, 'dueDate');
    assertAncoraNaoAntiga(input.dueDate, today);
    assertRecurrencePeriod(period);
    await this.assertCategoriaAtiva(input.categoryId, companyId);

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
    const empresa = companyIdObrigatorio(companyId);
    if (empresa !== this.companyIdDaSessao()) {
      throw new Error(MSG_EMPRESA_DIVERGENTE);
    }
    assertDataDeNegocio(today, 'today');
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
        falhas.push({ seriesId: serie.id, motivo: mensagemDe(erro) });
      }
    }
    if (falhas.length > 0) {
      throw new Error(mensagemDeFalhas(falhas));
    }
    return { generated: geradas, seriesProcessed: seriesAtivas.size };
  }

  private companyIdDaSessao(): string {
    return companyIdObrigatorio(this.tenantService.companyId());
  }

  /** Categoria nova so aceita categoria da empresa e nao arquivada. */
  private async assertCategoriaAtiva(categoryId: string, companyId: string): Promise<void> {
    const categoria = await this.lerCategoriaDaEmpresa(categoryId, companyId);
    if (categoria.archived) {
      throw new Error(MSG_CATEGORIA_ARQUIVADA);
    }
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
    await this.lerCategoriaDaEmpresa(template.categoryId, companyId);
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
      assertDataDeNegocio(serie.anchorDate, 'anchorDate');
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

function companyIdObrigatorio(companyId: string | null | undefined): string {
  if (!companyId) {
    throw new Error(MSG_SEM_EMPRESA);
  }
  return companyId;
}

function assertAncoraNaoAntiga(dueDate: DateKey, today: DateKey): void {
  assertDataDeNegocio(today, 'today');
  const limite = ExpenseScheduleService.addMonthsClamped(today, -MESES_MAXIMOS_ANCORA_PASSADA);
  if (dueDate < limite) {
    throw new Error(MSG_ANCORA_ANTIGA);
  }
}

/** Formato AAAA-MM-DD valido primeiro (doc corrompido vira mensagem de dominio), depois faixa de ano. */
function assertDataDeNegocio(date: DateKey, campo: string): void {
  assertDateKey(date, campo);
  const ano = Number(date.split('-')[0]);
  if (ano < ANO_MINIMO_DATA || ano > ANO_MAXIMO_DATA) {
    throw new Error(MSG_DATA_FORA_DA_FAIXA);
  }
}

function serieDoSnapshot(snap: DocumentSnapshot): ExpenseSeries | undefined {
  return snap.data() as ExpenseSeries | undefined;
}

function ehNegacaoDePermissao(erro: unknown): boolean {
  return (erro as { code?: unknown } | null)?.code === CODIGO_PERMISSAO_NEGADA;
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

function mensagemDeFalhas(falhas: FalhaDeSerie[]): string {
  const detalhes = falhas.map((f) => `${f.seriesId} (${f.motivo})`).join('; ');
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
