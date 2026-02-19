import { Injectable, inject, NgZone } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy
} from 'firebase/firestore';
import { Product } from '../../models/product-model';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ProductService {
  private firestore = inject(Firestore);
  private ngZone = inject(NgZone);
  private productsCollection;

  constructor() {
    this.productsCollection = collection(this.firestore, 'products');
  }

  getProducts(): Observable<Product[]> {
    return new Observable<Product[]>((observer) => {
      // Ordenar por título se possível, ou padrão
      const q = query(this.productsCollection); // Pode adicionar orderBy('title') se tiver index

      const unsubscribe = onSnapshot(q,
        (snapshot) => {
          const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Product));
          this.ngZone.run(() => observer.next(data));
        },
        (error) => {
          console.error("ProductService Error:", error);
          this.ngZone.run(() => observer.error(error));
        }
      );

      return () => unsubscribe();
    });
  }

  addProduct(product: Product) {
    // Remove o ID para que o Firestore gere um automático
    const { id, ...productData } = product;
    return addDoc(this.productsCollection, productData);
  }

  deleteProduct(id: string) {
    const productDocRef = doc(this.firestore, `products/${id}`);
    return deleteDoc(productDocRef);
  }

  /**
   * AJUSTE: Inverti a ordem dos parâmetros para bater com a chamada do componente: (id, dados)
   * E usei a tipagem correta para o Firestore não reclamar.
   */
  updateProduct(id: string, product: Partial<Product>) {
    const productDocRef = doc(this.firestore, `products/${id}`);

    // Cria uma cópia e remove o ID para não dar erro de escrita no Firestore
    const data = { ...product };
    delete data.id;

    // O cast 'as any' ou 'UpdateData' resolve o erro de propriedades incompatíveis (ts 2559)
    return updateDoc(productDocRef, data as any);
  }
}