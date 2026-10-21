import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  CollectionReference, DocumentData, DocumentReference, DocumentSnapshot, Query, Transaction,
  addDoc, collection, deleteField, doc, getDocs, query, runTransaction, serverTimestamp, where
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { Order } from '../../models/order-model';
import {
  RecurringOrder, RecurringOrderStatus
} from '../../models/recurring-order-model';
import { FirestoreBaseService } from '../firestore-base.service';
import { TenantService } from '../tenant-service/tenant-service';
import {
  AlteracaoDoModelo, CamposAlterados, dadosValidadosDaAlteracao, montarModeloDoPedido,
  montarPedidoDaOcorrencia, NovoPedidoRecorrente, ProblemaDaOcorrencia, ProdutoAtual
} from './recurring-order-build-rules';
import {
  AgendaDeRecorrencia, CivilDate, CursorDeGeracao, MODELO_ATIVO, agendaEsgotada,
  calcularJanelaDeGeracao, hojeCivil, idDaOcorrencia, listarDatasDeOcorrencia,
  proximaDataDeOcorrencia
} from './recurrence-rules';

/** Resultado de uma tentativa de gerar UMA ocorrencia (regra-de-negocio.md secao 5.4). */
export type ResultadoDaGeracao = 'created' | 'already-exists' | 'skipped-issue' | 'not-due';

export interface ResumoDaGeracao {
  criados: number;
  pulados: number;
  /** Ids dos modelos que falharam nesta rodada; presente so quando houve falha. */
  falhas?: string[];
}

type ModeloComId = RecurringOrder & { id: string };

interface OcorrenciaEmGeracao {
  companyId: string;
  data: CivilDate;
  modelo: RecurringOrder;
  modeloRef: DocumentReference;
  pedidoRef: DocumentReference;
  contadorRef: DocumentReference;
  proximoNumero: number;
}

const PRIMEIRO_NUMERO_DO_PEDIDO = 1;
const MODELO_PAUSADO: RecurringOrderStatus = 'paused';
const MODELO_ENCERRADO: RecurringOrderStatus = 'ended';
const COLECAO_PEDIDOS = 'orders';
const COLECAO_PRODUTOS = 'products';
const COLECAO_CONTADORES = 'counters';
const MENSAGEM_ENCERRADO = 'Pedido recorrente encerrado não pode ser alterado nem reaberto.';
const MENSAGEM_NAO_PAUSADO = 'Só é possível retomar pedido recorrente pausado.';

/** Pedido recorrente (secao 5.4): CRUD do modelo e geracao idempotente das ocorrencias.
 * A geracao roda no cliente. Cada ocorrencia e uma transacao propria: a trava de
 * idempotencia e o cursor (lastGeneratedDate, monotonico), gravado junto com o pedido
 * (id deterministico rec_{modelo}_{yyyyMMdd}) e com o contador.
 */
@Injectable({
  providedIn: 'root',
})
export class RecurringOrderService extends FirestoreBaseService {
  private firestore = inject(Firestore);
  private tenantService = inject(TenantService);

  private readonly RECURRING_ORDERS_COLLECTION = 'recurringOrders';
  private recurringOrdersCollection: CollectionReference;

  constructor() {
    super();
    this.recurringOrdersCollection = collection(this.firestore, this.RECURRING_ORDERS_COLLECTION);
  }

  getRecurringOrders(): Observable<RecurringOrder[]> {
    return this.collectionDataObservable<RecurringOrder>(this.modelosDaSessao());
  }

  getByCustomer(customerId: string): Observable<RecurringOrder[]> {
    return this.collectionDataObservable<RecurringOrder>(
      query(this.modelosDaSessao(), where('customerId', '==', customerId))
    );
  }

  /** Cria o modelo a partir de um pedido; devolve o id do modelo. */
  async createFromOrder(order: Order, agenda: AgendaDeRecorrencia): Promise<string> {
    const companyId = this.companyIdDaSessao();
    const modelo = montarModeloDoPedido(order, agenda);
    const ref = await addDoc(this.recurringOrdersCollection, {
      ...modelo,
      companyId,
      createdAt: serverTimestamp()
    });
    return ref.id;
  }

  /** So afeta ocorrencias ainda nao geradas. Modelo encerrado nao e editavel. */
  async update(id: string, alteracao: AlteracaoDoModelo): Promise<void> {
    await this.alterarModelo(id, modelo => {
      garantirNaoEncerrado(modelo);
      return dadosValidadosDaAlteracao(modelo, alteracao);
    });
  }

  async pause(id: string): Promise<void> {
    await this.alterarModelo(id, modelo => {
      garantirNaoEncerrado(modelo);
      return { status: MODELO_PAUSADO };
    });
  }

  /** So retoma modelo pausado: volta a 'active' com generateFrom = hoje (nunca gera o periodo pausado). */
  async resume(id: string, agora: Date = new Date()): Promise<void> {
    await this.alterarModelo(id, modelo => {
      garantirNaoEncerrado(modelo);
      garantirPausado(modelo);
      return { status: MODELO_ATIVO, generateFrom: hojeCivil(agora) };
    });
  }

  /** Definitivo: encerrado nao reabre. */
  async end(id: string): Promise<void> {
    await this.alterarModelo(id, () => ({ status: MODELO_ENCERRADO }));
  }

  /**
   * Gera as ocorrencias devidas dos modelos ativos da empresa e encerra as agendas esgotadas.
   * Falha de um modelo e isolada: vai para falhas e os demais seguem.
   */
  async generateDueOccurrences(agora: Date = new Date()): Promise<ResumoDaGeracao> {
    const companyId = this.companyIdDaSessao();
    const produtos = await this.carregarProdutosDaEmpresa(companyId);
    const resumo: ResumoDaGeracao = { criados: 0, pulados: 0 };
    const falhas: string[] = [];
    for (const modelo of await this.listarModelosAtivos()) {
      try {
        await this.gerarDevidasDoModelo(modelo, agora, resumo, companyId, produtos);
        await this.encerrarSeEsgotada(modelo, hojeCivil(agora));
      } catch (erro) {
        falhas.push(modelo.id);
        console.error(`Falha ao gerar ocorrencias do pedido recorrente ${modelo.id}`, erro);
      }
    }
    return falhas.length > 0 ? { ...resumo, falhas } : resumo;
  }

  /** Gera UMA ocorrencia em transacao; idempotente. */
  async generateOccurrence(id: string, data: CivilDate, agora: Date = new Date()): Promise<ResultadoDaGeracao> {
    const companyId = this.companyIdDaSessao();
    const produtos = await this.carregarProdutosDaEmpresa(companyId);
    return this.gerarOcorrencia(id, data, agora, companyId, produtos);
  }

  /** Transacao de UMA ocorrencia; recebe os produtos ja carregados (uma leitura por rodada). */
  private gerarOcorrencia(
    id: string,
    data: CivilDate,
    agora: Date,
    companyId: string,
    produtos: ReadonlyMap<string, ProdutoAtual>
  ): Promise<ResultadoDaGeracao> {
    const hoje = hojeCivil(agora);
    const modeloRef = doc(this.recurringOrdersCollection, id);
    const pedidoRef = doc(this.firestore, COLECAO_PEDIDOS, idDaOcorrencia(id, data));
    const contadorRef = doc(this.firestore, COLECAO_CONTADORES, companyId);

    return runTransaction(this.firestore, async (transaction): Promise<ResultadoDaGeracao> => {
      const contadorSnap = await transaction.get(contadorRef);
      const modeloSnap = await transaction.get(modeloRef);
      const modelo = modeloSnap.exists() ? lerModelo(modeloSnap) : undefined;

      if (!modeloAtivoDaSessao(modelo, companyId)) {
        return 'not-due';
      }
      if (jaGerada(modelo, data)) {
        return 'already-exists';
      }
      if (!datasDevidas(modelo, hoje).includes(data)) {
        return 'not-due';
      }

      const ocorrencia: OcorrenciaEmGeracao = {
        companyId,
        data,
        modelo,
        modeloRef,
        pedidoRef,
        contadorRef,
        proximoNumero: proximoNumeroDoPedido(contadorSnap)
      };
      const resultado = montarPedidoDaOcorrencia(modelo, data, produtos);
      if (!resultado.ok) {
        gravarOcorrenciaPulada(transaction, ocorrencia, resultado.problema);
        return 'skipped-issue';
      }
      gravarOcorrenciaCriada(transaction, ocorrencia, resultado.pedido);
      return 'created';
    });
  }

  private companyIdDaSessao(): string {
    const companyId = this.tenantService.companyId();
    if (!companyId) {
      throw new Error(
        'Não é possível usar pedido recorrente sem uma empresa (companyId) ' +
        'associada à sessão atual.'
      );
    }
    return companyId;
  }

  private modelosDaSessao(): Query {
    return query(
      this.recurringOrdersCollection,
      where('companyId', '==', this.tenantService.companyId())
    );
  }

  private async listarModelosAtivos(): Promise<ModeloComId[]> {
    const snap = await getDocs(this.modelosDaSessao());
    return snap.docs
      .map(modeloSnap => lerModelo(modeloSnap) as ModeloComId)
      .filter(modelo => modelo.status === MODELO_ATIVO);
  }

  private async gerarDevidasDoModelo(
    modelo: ModeloComId,
    agora: Date,
    resumo: ResumoDaGeracao,
    companyId: string,
    produtos: ReadonlyMap<string, ProdutoAtual>
  ): Promise<void> {
    for (const data of datasDevidas(modelo, hojeCivil(agora))) {
      somarResultado(resumo, await this.gerarOcorrencia(modelo.id, data, agora, companyId, produtos));
    }
  }

  /** Reavalia dentro da transacao: so grava 'ended' se a agenda continua esgotada. */
  private async encerrarSeEsgotada(modelo: ModeloComId, hoje: CivilDate): Promise<void> {
    const ref = doc(this.recurringOrdersCollection, modelo.id);
    await runTransaction(this.firestore, async (transaction) => {
      const atual = lerModelo(await transaction.get(ref));
      if (atual.status === MODELO_ATIVO && agendaEsgotada(agendaDoModelo(atual), cursorDoModelo(atual), hoje)) {
        transaction.update(ref, { status: MODELO_ENCERRADO });
      }
    });
  }

  /**
   * Leitura fora da transacao: precos/custos atuais da empresa, uma consulta unica por companyId
   * (a regra de list nega consulta com documentId in quando algum id nao existe, e produto
   * excluido precisa virar PRODUTO_INDISPONIVEL, nao erro).
   */
  private async carregarProdutosDaEmpresa(companyId: string): Promise<Map<string, ProdutoAtual>> {
    const snap = await getDocs(query(
      collection(this.firestore, COLECAO_PRODUTOS),
      where('companyId', '==', companyId)
    ));
    return new Map(snap.docs.map(produtoSnap => [
      produtoSnap.id,
      { ...produtoSnap.data(), id: produtoSnap.id } as ProdutoAtual
    ]));
  }

  private async alterarModelo(
    id: string,
    decidirAlteracao: (modelo: RecurringOrder) => CamposAlterados
  ): Promise<void> {
    const companyId = this.companyIdDaSessao();
    const ref = doc(this.recurringOrdersCollection, id);
    await runTransaction(this.firestore, async (transaction) => {
      const modelo = await lerModeloDaSessao(transaction, ref, companyId);
      transaction.update(ref, paraEscritaDoFirestore(decidirAlteracao(modelo)));
    });
  }
}

function lerModelo(snap: DocumentSnapshot): RecurringOrder {
  return { ...snap.data(), id: snap.id } as RecurringOrder;
}

async function lerModeloDaSessao(
  transaction: Transaction,
  ref: DocumentReference,
  companyId: string
): Promise<RecurringOrder> {
  const snap = await transaction.get(ref);
  const modelo = snap.exists() ? lerModelo(snap) : undefined;
  if (!modelo || modelo.companyId !== companyId) {
    throw new Error('Pedido recorrente não encontrado nesta empresa.');
  }
  return modelo;
}

/** Traduz o marcador neutro (null = remover) para o sentinela do Firestore. */
function paraEscritaDoFirestore(campos: CamposAlterados): DocumentData {
  return Object.fromEntries(
    Object.entries(campos).map(([campo, valor]) => [campo, valor === null ? deleteField() : valor])
  );
}

function garantirNaoEncerrado(modelo: RecurringOrder): void {
  if (modelo.status === MODELO_ENCERRADO) {
    throw new Error(MENSAGEM_ENCERRADO);
  }
}

function garantirPausado(modelo: RecurringOrder): void {
  if (modelo.status !== MODELO_PAUSADO) {
    throw new Error(MENSAGEM_NAO_PAUSADO);
  }
}

function modeloAtivoDaSessao(
  modelo: RecurringOrder | undefined,
  companyId: string
): modelo is RecurringOrder {
  return modelo !== undefined
    && modelo.companyId === companyId
    && modelo.status === MODELO_ATIVO;
}

/** Cursor monotonico: data ja coberta pelo cursor (gerada ou pulada) nao e gerada de novo. */
function jaGerada(modelo: RecurringOrder, data: CivilDate): boolean {
  return modelo.lastGeneratedDate !== undefined && data <= modelo.lastGeneratedDate;
}

function datasDevidas(modelo: RecurringOrder, hoje: CivilDate): CivilDate[] {
  const janela = calcularJanelaDeGeracao(cursorDoModelo(modelo), hoje);
  return janela === null ? [] : listarDatasDeOcorrencia(agendaDoModelo(modelo), janela);
}

function agendaDoModelo(modelo: RecurringOrder): AgendaDeRecorrencia {
  return {
    frequency: modelo.frequency,
    startDate: modelo.startDate,
    weekdays: modelo.weekdays,
    endDate: modelo.endDate
  };
}

function cursorDoModelo(modelo: RecurringOrder): CursorDeGeracao {
  return {
    generateFrom: modelo.generateFrom,
    lastGeneratedDate: modelo.lastGeneratedDate,
    endDate: modelo.endDate
  };
}

/** Sem proxima data (passou do endDate) o modelo vira 'ended' na mesma escrita. */
function camposDeFimDeAgenda(modelo: RecurringOrder, data: CivilDate): { status?: RecurringOrderStatus } {
  return proximaDataDeOcorrencia(agendaDoModelo(modelo), data) === null
    ? { status: MODELO_ENCERRADO }
    : {};
}

function proximoNumeroDoPedido(contadorSnap: DocumentSnapshot): number {
  return contadorSnap.exists()
    ? (contadorSnap.data()?.['nextOrderNumber'] as number)
    : PRIMEIRO_NUMERO_DO_PEDIDO;
}

function gravarOcorrenciaCriada(
  transaction: Transaction,
  ocorrencia: OcorrenciaEmGeracao,
  pedido: NovoPedidoRecorrente
): void {
  const { companyId, data, modelo, modeloRef, pedidoRef, contadorRef, proximoNumero } = ocorrencia;
  transaction.set(pedidoRef, {
    ...pedido,
    companyId,
    orderNumber: proximoNumero,
    createdAt: serverTimestamp()
  });
  transaction.set(contadorRef, { nextOrderNumber: proximoNumero + 1 }, { merge: true });
  transaction.update(modeloRef, {
    lastGeneratedDate: data,
    generatedCount: (modelo.generatedCount ?? 0) + 1,
    ...camposDeFimDeAgenda(modelo, data)
  });
}

/** Pulada: nao consome orderNumber nem conta em generatedCount; o cursor avanca. */
function gravarOcorrenciaPulada(
  transaction: Transaction,
  ocorrencia: OcorrenciaEmGeracao,
  problema: ProblemaDaOcorrencia
): void {
  const { data, modelo, modeloRef } = ocorrencia;
  transaction.update(modeloRef, {
    lastGeneratedDate: data,
    lastIssue: { date: data, code: problema.code, detail: problema.detail },
    ...camposDeFimDeAgenda(modelo, data)
  });
}

function somarResultado(resumo: ResumoDaGeracao, resultado: ResultadoDaGeracao): void {
  if (resultado === 'created') {
    resumo.criados += 1;
  }
  if (resultado === 'skipped-issue') {
    resumo.pulados += 1;
  }
}
