import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  collection, doc, addDoc, updateDoc, deleteDoc, query, where, orderBy
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Vendedor, ComissaoVendedorResultado } from '../../models/vendedor-model';
import { Order } from '../../models/order-model';
import { FirestoreBaseService } from '../firestore-base.service';
import { TenantService } from '../tenant-service/tenant-service';

@Injectable({
  providedIn: 'root'
})
export class VendedorService extends FirestoreBaseService {
  private firestore = inject(Firestore);
  private tenantService = inject(TenantService);
  private readonly COLLECTION = 'vendedores';

  getVendedores(): Observable<Vendedor[]> {
    const q = query(
      collection(this.firestore, this.COLLECTION),
      where('companyId', '==', this.tenantService.companyId())
    );
    return this.collectionDataObservable<Vendedor>(q).pipe(
      map(vendedores => [...vendedores].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')))
    );
  }

  async addVendedor(vendedor: Omit<Vendedor, 'id' | 'companyId'>) {
    const companyId = this.tenantService.companyId();
    if (!companyId) {
      throw new Error(
        'Não é possível adicionar vendedor sem uma empresa (companyId) ' +
        'associada à sessão atual.'
      );
    }
    return addDoc(collection(this.firestore, this.COLLECTION), {
      ...vendedor,
      companyId
    });
  }

  updateVendedor(id: string, data: Partial<Omit<Vendedor, 'id'>>) {
    return updateDoc(doc(this.firestore, `${this.COLLECTION}/${id}`), data);
  }

  deleteVendedor(id: string) {
    return deleteDoc(doc(this.firestore, `${this.COLLECTION}/${id}`));
  }

  static calculateComissaoVendedor(orders: Order[], vendedor: Vendedor): ComissaoVendedorResultado {
    let totalVendido = 0;
    let totalComissao = 0;

    for (const order of orders) {
      // Filtra: status DEVE ser 'finished' E vendedorId DEVE ser o do vendedor
      if (order.status !== 'finished' || order.vendedorId !== vendedor.id) {
        continue;
      }

      // Processa cada item do pedido qualificado
      for (const item of order.items) {
        // vendidoItem = priceAtSale * quantity
        const vendidoItem = item.priceAtSale * item.quantity;
        totalVendido += vendidoItem;

        // Busca percentual cadastrado para o produto ou 0 se ausente
        const comissaoItem = vendedor.comissoes.find(c => c.idProduct === item.idProduct);
        const percentual = comissaoItem ? comissaoItem.percentual : 0;

        // comissaoItem = vendidoItem * percentual / 100
        const comissao = vendidoItem * percentual / 100;
        totalComissao += comissao;
      }
    }

    return {
      vendedorId: vendedor.id!,
      vendedorName: vendedor.name,
      totalVendido,
      totalComissao
    };
  }
}
