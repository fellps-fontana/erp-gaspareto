import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  collection, addDoc, doc, updateDoc, deleteDoc, query, increment, UpdateData
} from 'firebase/firestore';
import { Product } from '../../models/product-model';
import { Observable } from 'rxjs';
import { FirestoreBaseService } from '../firestore-base.service';

@Injectable({
  providedIn: 'root',
})
export class ProductService extends FirestoreBaseService {
  private firestore = inject(Firestore);
  private productsCollection;

  constructor() {
    super();
    this.productsCollection = collection(this.firestore, 'products');
  }

  getProducts(): Observable<Product[]> {
    return this.collectionDataObservable<Product>(query(this.productsCollection));
  }

  addProduct(product: Omit<Product, 'id' | 'companyId'>) {
    return addDoc(this.productsCollection, product);
  }

  deleteProduct(id: string) {
    return deleteDoc(doc(this.firestore, `products/${id}`));
  }

  updateProduct(id: string, product: Partial<Omit<Product, 'id'>>) {
    return updateDoc(
      doc(this.firestore, `products/${id}`),
      product as UpdateData<Product>
    );
  }

  decreaseStock(id: string, quantity: number) {
    return updateDoc(doc(this.firestore, `products/${id}`), {
      stock: increment(-quantity)
    });
  }

  increaseStock(id: string, quantity: number) {
    return updateDoc(doc(this.firestore, `products/${id}`), {
      stock: increment(quantity)
    });
  }
}
