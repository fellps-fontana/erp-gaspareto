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
        totalComissao: 0,
        itens: []
      };
    }

    // Mapa para agregar itens por produto
    const itemsByProduct = new Map<string, {
      productName: string;
      quantidade: number;
      totalVendido: number;
      percentual: number;
      totalComissao: number;
    }>();

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
        const percentual = configComissao?.percentual ?? 0;
        const comissaoItem = (vendidoItem * percentual) / 100;

        totalVendido += vendidoItem;
        totalComissao += comissaoItem;

        // Agregar por produto
        if (itemsByProduct.has(item.idProduct)) {
          const existing = itemsByProduct.get(item.idProduct)!;
          existing.quantidade += item.quantity;
          existing.totalVendido += vendidoItem;
          existing.totalComissao += comissaoItem;
        } else {
          itemsByProduct.set(item.idProduct, {
            productName: item.productName,
            quantidade: item.quantity,
            totalVendido: vendidoItem,
            percentual,
            totalComissao: comissaoItem
          });
        }
      });
    });

    // Converter mapa em array e ordenar
    const itens = Array.from(itemsByProduct.entries())
      .map(([idProduct, data]) => ({
        idProduct,
        ...data
      }))
      .sort((a, b) => {
        // Ordenar por totalVendido desc
        if (a.totalVendido !== b.totalVendido) {
          return b.totalVendido - a.totalVendido;
        }
        // Empate: ordenar por productName asc (pt-BR)
        return a.productName.localeCompare(b.productName, 'pt-BR');
      });

    return {
      vendedorId: vendedor.id,
      vendedorName: vendedor.name,
      totalVendido,
      totalComissao,
      itens
    };
  }
}
