import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  collection, doc, addDoc, updateDoc, deleteDoc, query, where
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
      throw new Error('Não é possível adicionar vendedor sem empresa associada à sessão.');
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

  static calculateComissaoVendedor(
    orders: Order[],
    vendedor: Vendedor
  ): ComissaoVendedorResultado {
    // Guard: se o vendedor não tem ID, retorna zerado — nunca processa orders
    if (!vendedor.id) {
      return {
        vendedorId: vendedor.id ?? '',
        vendedorName: vendedor.name,
        totalVendido: 0,
        totalComissao: 0
      };
    }

    let totalVendido = 0;
    let totalComissao = 0;

    orders.forEach(order => {
      if (order.status !== 'finished' || order.vendedorId !== vendedor.id) {
        return;
      }

      order.items.forEach(item => {
        const vendidoItem = item.priceAtSale * item.quantity;
        const configComissao = vendedor.comissoes.find(
          c => c.idProduct === item.idProduct
        );

        totalVendido += vendidoItem;

        if (configComissao) {
          const comissaoItem = (vendidoItem * configComissao.percentual) / 100;
          totalComissao += comissaoItem;
        }
      });
    });

    return {
      vendedorId: vendedor.id,
      vendedorName: vendedor.name,
      totalVendido,
      totalComissao
    };
  }
}
