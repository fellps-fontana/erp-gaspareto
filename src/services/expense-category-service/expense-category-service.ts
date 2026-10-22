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
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { map, Observable } from 'rxjs';
import { ExpenseCategory, ExpenseCategoryType } from '../../models/expense-model';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DefaultExpenseCategoryDef,
  defaultCategoryId,
} from '../../models/expense-category-defaults';
import {
  COLECAO_CATEGORIAS,
  COLECAO_DESPESAS,
  COLECAO_SERIES,
  exigirCompanyId,
} from '../expense-firestore-guards/expense-firestore-guards';
import { FirestoreBaseService } from '../firestore-base.service';
import { TenantService } from '../tenant-service/tenant-service';

const TIPOS_DE_CATEGORIA: readonly ExpenseCategoryType[] = [
  'custo_producao',
  'despesa_operacional',
];

const MSG_SEM_EMPRESA =
  'Não é possível salvar categoria sem uma empresa (companyId) associada à sessão atual.';
const MSG_TIPO_INVALIDO =
  'Tipo de categoria inválido: escolha custo de produção ou despesa operacional.';
const MSG_CATEGORIA_NAO_ENCONTRADA = 'Categoria não encontrada nesta empresa.';
const MSG_CATEGORIA_VINCULADA =
  'Categoria com despesa ou recorrência vinculada não pode ser excluída; arquive-a.';

@Injectable({ providedIn: 'root' })
export class ExpenseCategoryService extends FirestoreBaseService {
  private firestore = inject(Firestore);
  private tenantService = inject(TenantService);

  /** where(companyId); ordenacao por name client-side (sem indice composto). */
  getCategories(): Observable<ExpenseCategory[]> {
    const q = query(
      collection(this.firestore, COLECAO_CATEGORIAS),
      where('companyId', '==', this.tenantService.companyId()),
    );
    return this.collectionDataObservable<ExpenseCategory>(q).pipe(
      map((categorias) => [...categorias].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))),
    );
  }

  /**
   * Seed unico: cria as 12 padrao somente se a empresa nao tem NENHUMA categoria
   * (inclusive arquivada ou custom). Caso contrario nao faz nada, para que uma
   * padrao excluida sem vinculo nao volte (regra 8.1).
   */
  async ensureDefaults(): Promise<void> {
    const companyId = this.companyIdDaSessao();
    if (await this.empresaTemCategorias(companyId)) {
      return;
    }

    const lote = writeBatch(this.firestore);
    for (const def of DEFAULT_EXPENSE_CATEGORIES) {
      lote.set(
        doc(this.firestore, COLECAO_CATEGORIAS, defaultCategoryId(companyId, def.systemKey)),
        this.montarCategoriaPadrao(def, companyId),
      );
    }
    await lote.commit();
  }

  async addCategory(name: string, type: ExpenseCategoryType): Promise<string> {
    const companyId = this.companyIdDaSessao();
    if (!TIPOS_DE_CATEGORIA.includes(type)) {
      throw new Error(MSG_TIPO_INVALIDO);
    }
    const ref = await addDoc(collection(this.firestore, COLECAO_CATEGORIAS), {
      companyId,
      name,
      type,
      archived: false,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }

  /** Renomeia. O tipo nao e alteravel: o metodo grava somente o name. */
  async renameCategory(id: string, name: string): Promise<void> {
    const companyId = this.companyIdDaSessao();
    const ref = doc(this.firestore, COLECAO_CATEGORIAS, id);
    await this.garantirCategoriaDaEmpresa(ref, companyId);
    await updateDoc(ref, { name });
  }

  async setArchived(id: string, archived: boolean): Promise<void> {
    const companyId = this.companyIdDaSessao();
    const ref = doc(this.firestore, COLECAO_CATEGORIAS, id);
    await this.garantirCategoriaDaEmpresa(ref, companyId);
    await updateDoc(ref, { archived });
  }

  /** Lanca se houver expense ou serie vinculada (so arquivar). */
  async deleteCategory(id: string): Promise<void> {
    const companyId = this.companyIdDaSessao();
    const ref = doc(this.firestore, COLECAO_CATEGORIAS, id);
    await this.garantirCategoriaDaEmpresa(ref, companyId);
    if (await this.possuiVinculo(companyId, id)) {
      throw new Error(MSG_CATEGORIA_VINCULADA);
    }
    await deleteDoc(ref);
  }

  private companyIdDaSessao(): string {
    return exigirCompanyId(this.tenantService.companyId(), MSG_SEM_EMPRESA);
  }

  private async empresaTemCategorias(companyId: string): Promise<boolean> {
    const snap = await getDocs(
      query(
        collection(this.firestore, COLECAO_CATEGORIAS),
        where('companyId', '==', companyId),
        limit(1),
      ),
    );
    return !snap.empty;
  }

  /**
   * Doc inexistente nao chega ao guard: a rule nega a leitura (resource nulo) antes.
   * O guard e defesa em profundidade contra doc de outra empresa.
   */
  private async garantirCategoriaDaEmpresa(
    ref: DocumentReference,
    companyId: string,
  ): Promise<void> {
    categoriaDaEmpresaOuLancar(await getDoc(ref), companyId);
  }

  private async possuiVinculo(companyId: string, categoryId: string): Promise<boolean> {
    const [despesas, series] = await Promise.all([
      getDocs(
        query(
          collection(this.firestore, COLECAO_DESPESAS),
          where('companyId', '==', companyId),
          where('categoryId', '==', categoryId),
          limit(1),
        ),
      ),
      getDocs(
        query(
          collection(this.firestore, COLECAO_SERIES),
          where('companyId', '==', companyId),
          where('template.categoryId', '==', categoryId),
          limit(1),
        ),
      ),
    ]);
    return !despesas.empty || !series.empty;
  }

  private montarCategoriaPadrao(def: DefaultExpenseCategoryDef, companyId: string): DocumentData {
    return {
      companyId,
      name: def.name,
      type: def.type,
      archived: false,
      systemKey: def.systemKey,
      createdAt: serverTimestamp(),
    };
  }
}

function categoriaDaEmpresaOuLancar(snap: DocumentSnapshot, companyId: string): ExpenseCategory {
  const categoria = snap.data() as ExpenseCategory | undefined;
  if (categoria === undefined || categoria.companyId !== companyId) {
    throw new Error(MSG_CATEGORIA_NAO_ENCONTRADA);
  }
  return categoria;
}
