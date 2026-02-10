import { Injectable } from '@angular/core';
import { 
  Firestore, 
  collection, 
  collectionData, 
  addDoc, 
  doc, 
  updateDoc, 
  deleteDoc 
} from '@angular/fire/firestore';
import { Product } from '../../models/product-model';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ProductService {
  private productsCollection;

  constructor(private firestore: Firestore) {
    this.productsCollection = collection(this.firestore, 'products');
  }

  getProducts(): Observable<Product[]> {
    return collectionData(this.productsCollection, { idField: 'id' }) as Observable<Product[]>;
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