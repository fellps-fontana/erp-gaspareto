import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  DocumentReference, DocumentSnapshot, Transaction, collection, doc, getDocs, query,
  runTransaction, serverTimestamp, where
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import {
  CivilDate, Competence, SubscriptionCharge, SubscriptionConfig, SubscriptionConfigInput
} from '../../models/subscription-model';
import { FirestoreBaseService } from '../firestore-base.service';
import { hojeCivil } from '../recurring-order-service/recurrence-rules';
import {
  GeracaoParcialError, MensalidadeInvalidaError, STATUS_A_PAGAR, camposDoDesfazimento,
  camposDoPagamento, competenciasAGerar, generateFromAoSalvar, idDaCobranca, montarCobranca,
  validarConfig
} from './subscription-rules';

const COLECAO_CONFIGS = 'subscriptions';
const COLECAO_COBRANCAS = 'subscriptionCharges';
const CAMPO_ATIVO = 'active';
const CAMPO_EMPRESA = 'companyId';
const CAMPO_STATUS = 'status';
const MENSAGEM_COBRANCA_NAO_ENCONTRADA = 'Cobrança de mensalidade não encontrada.';

/** Acumulador da geracao: cobrancas gravadas e empresas que falharam nesta rodada. */
interface ContagemDaGeracao {
  criadas: number;
  empresasComFalha: string[];
}

/** Config ativa com o id do seu documento: identifica a empresa mesmo sem companyId. */
interface ConfigComDocId {
  docId: string;
  config: SubscriptionConfig;
}

/** Mensalidade da plataforma — regra-de-negocio.md secao 15. Regras puras em subscription-rules. */
@Injectable({ providedIn: 'root' })
export class SubscriptionService extends FirestoreBaseService {
  private firestore = inject(Firestore);
  private readonly configsCollection = collection(this.firestore, COLECAO_CONFIGS);
  private readonly chargesCollection = collection(this.firestore, COLECAO_COBRANCAS);

  /** Super-admin: todas as configs. */
  getConfigs(): Observable<SubscriptionConfig[]> {
    return this.collectionDataObservable<SubscriptionConfig>(this.configsCollection);
  }

  /** Super-admin: todas as cobrancas. */
  getCharges(): Observable<SubscriptionCharge[]> {
    return this.collectionDataObservable<SubscriptionCharge>(this.chargesCollection);
  }

  /** Empresa: cobrancas a_pagar do proprio companyId (sem orderBy, sem indice composto). */
  getOpenChargesOfCompany(companyId: string): Observable<SubscriptionCharge[]> {
    return this.collectionDataObservable<SubscriptionCharge>(query(
      this.chargesCollection,
      where(CAMPO_EMPRESA, '==', companyId),
      where(CAMPO_STATUS, '==', STATUS_A_PAGAR)
    ));
  }

  /** Super-admin: grava a config da empresa. Valida antes de tocar no banco. */
  async saveConfig(
    companyId: string,
    input: SubscriptionConfigInput,
    hoje: CivilDate = hojeCivil(new Date())
  ): Promise<void> {
    validarConfig(input);
    const ref = doc(this.firestore, COLECAO_CONFIGS, companyId);
    await runTransaction(this.firestore, async (transaction) => {
      const existente = await lerConfigOpcional(transaction, ref);
      transaction.set(ref, {
        companyId,
        amount: input.amount,
        dueDay: input.dueDay,
        active: input.active,
        contractStart: input.contractStart,
        generateFrom: generateFromAoSalvar(existente, input, hoje),
        createdAt: existente?.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });
  }

  /**
   * Gera as cobrancas devidas (idempotente); retorna quantas criou. Falha de uma empresa
   * e isolada: as demais seguem e, ao final, lanca GeracaoParcialError.
   */
  async generateDueCharges(hoje: CivilDate = hojeCivil(new Date())): Promise<number> {
    const contagem: ContagemDaGeracao = { criadas: 0, empresasComFalha: [] };
    for (const configComDocId of await this.listarConfigsAtivas()) {
      await this.gerarCobrancasIsolada(configComDocId, hoje, contagem);
    }
    if (contagem.empresasComFalha.length > 0) {
      throw new GeracaoParcialError(contagem.criadas, contagem.empresasComFalha);
    }
    return contagem.criadas;
  }

  /** a_pagar -> pago; lanca JA_PAGA se ja paga. */
  async markAsPaid(chargeId: string, paidDate: CivilDate = hojeCivil(new Date())): Promise<void> {
    const ref = this.referenciaDaCobranca(chargeId);
    await runTransaction(this.firestore, async (transaction) => {
      const cobranca = await lerCobrancaExistente(transaction, ref);
      transaction.update(ref, camposDoPagamento(cobranca, paidDate));
    });
  }

  /** pago -> a_pagar (corrige "Recebi" por engano); lanca NAO_PAGA se nao esta paga. */
  async undoPayment(chargeId: string): Promise<void> {
    const ref = this.referenciaDaCobranca(chargeId);
    await runTransaction(this.firestore, async (transaction) => {
      const cobranca = await lerCobrancaExistente(transaction, ref);
      transaction.update(ref, camposDoDesfazimento(cobranca));
    });
  }

  private async listarConfigsAtivas(): Promise<ConfigComDocId[]> {
    const snap = await getDocs(query(this.configsCollection, where(CAMPO_ATIVO, '==', true)));
    return snap.docs.map(configSnap => ({ docId: configSnap.id, config: lerConfig(configSnap) }));
  }

  private async gerarCobrancasIsolada(
    { docId, config }: ConfigComDocId,
    hoje: CivilDate,
    contagem: ContagemDaGeracao
  ): Promise<void> {
    try {
      await this.gerarCobrancasDaEmpresa(config, hoje, contagem);
    } catch (erro) {
      contagem.empresasComFalha.push(docId);
      console.error(`Falha ao gerar mensalidade da empresa ${docId}`, erro);
    }
  }

  private async gerarCobrancasDaEmpresa(
    config: SubscriptionConfig,
    hoje: CivilDate,
    contagem: ContagemDaGeracao
  ): Promise<void> {
    const existentes = await this.competenciasExistentes(config.companyId);
    for (const competencia of competenciasAGerar(config, hoje, existentes)) {
      if (await this.criarCobrancaSeAusente(config, competencia)) {
        contagem.criadas += 1;
      }
    }
  }

  /** Pre-filtro de leitura; a garantia de nao duplicar fica na transacao de criacao. */
  private async competenciasExistentes(companyId: string): Promise<Set<Competence>> {
    const snap = await getDocs(query(
      this.chargesCollection,
      where(CAMPO_EMPRESA, '==', companyId)
    ));
    return new Set(snap.docs.map(chargeSnap => lerCobranca(chargeSnap).competence));
  }

  /** Transacao: so grava se o doc com o id deterministico ainda nao existe. true = criou. */
  private criarCobrancaSeAusente(
    config: SubscriptionConfig,
    competencia: Competence
  ): Promise<boolean> {
    const ref = doc(this.firestore, COLECAO_COBRANCAS, idDaCobranca(config.companyId, competencia));
    return runTransaction(this.firestore, async (transaction) => {
      const snap = await transaction.get(ref);
      if (snap.exists()) {
        return false;
      }
      transaction.set(ref, {
        ...montarCobranca(config, competencia),
        createdAt: serverTimestamp()
      });
      return true;
    });
  }

  private referenciaDaCobranca(chargeId: string): DocumentReference {
    return doc(this.firestore, COLECAO_COBRANCAS, chargeId);
  }
}

function lerConfig(snap: DocumentSnapshot): SubscriptionConfig {
  return snap.data() as SubscriptionConfig;
}

async function lerConfigOpcional(
  transaction: Transaction,
  ref: DocumentReference
): Promise<SubscriptionConfig | undefined> {
  const snap = await transaction.get(ref);
  return snap.exists() ? lerConfig(snap) : undefined;
}

function lerCobranca(snap: DocumentSnapshot): SubscriptionCharge {
  return { ...snap.data(), id: snap.id } as SubscriptionCharge;
}

async function lerCobrancaExistente(
  transaction: Transaction,
  ref: DocumentReference
): Promise<SubscriptionCharge> {
  const snap = await transaction.get(ref);
  if (!snap.exists()) {
    throw new MensalidadeInvalidaError('COBRANCA_NAO_ENCONTRADA', MENSAGEM_COBRANCA_NAO_ENCONTRADA);
  }
  return lerCobranca(snap);
}
