import { Injectable, inject, NgZone } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
    collection, doc, updateDoc, query, where, orderBy,
    serverTimestamp, runTransaction, increment, Transaction, onSnapshot
} from 'firebase/firestore';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Comanda } from '../../models/comanda-model';

@Injectable({
    providedIn: 'root'
})
export class ComandaService {
    private firestore = inject(Firestore);
    private ngZone = inject(NgZone);
    private readonly COLLECTION_NAME = 'comandas';

    /**
     * Helper para transformar onSnapshot em Observable estável (Native SDK)
     */
    private collectionDataObservable<T>(queryFn: any): Observable<T[]> {
        return new Observable<T[]>((observer) => {
            console.log(`ComandaService: [onSnapshot] Iniciando listener para ${this.COLLECTION_NAME}...`);
            const unsubscribe = onSnapshot(queryFn,
                (snapshot: any) => {
                    console.log(`ComandaService: [onSnapshot] Snapshot recebido! Docs: ${snapshot.docs.length}`);
                    const data = snapshot.docs.map((doc: any) => ({
                        id: doc.id,
                        ...doc.data()
                    }));
                    this.ngZone.run(() => observer.next(data));
                },
                (error: any) => {
                    console.error("ComandaService: [onSnapshot] ERRO:", error);
                    this.ngZone.run(() => observer.error(error));
                }
            );
            return () => {
                console.log(`ComandaService: [onSnapshot] Encerrando listener.`);
                unsubscribe();
            };
        });
    }

    getOpenComandas(): Observable<Comanda[]> {
        const comandaCol = collection(this.firestore, this.COLLECTION_NAME);

        // Query simplificada: Apenas filtro por status. 
        // SEM orderBy no banco para evitar erro de Index.
        const q = query(comandaCol, where('status', '==', 'open'));

        console.log("ComandaService: Solicitando comandas 'open' (sem orderBy no Firebase)");

        return this.collectionDataObservable<Comanda>(q).pipe(
            map(comandas => {
                // Ordenação feita aqui no Cliente
                return comandas
                    .sort((a, b) => {
                        const dateA = (a.createdAt as any)?.toMillis?.() || (a.createdAt as any)?.seconds * 1000 || 0;
                        const dateB = (b.createdAt as any)?.toMillis?.() || (b.createdAt as any)?.seconds * 1000 || 0;
                        return dateB - dateA;
                    });
            })
        );
    }

    async addComanda(comanda: Omit<Comanda, 'id' | 'createdAt' | 'status'>): Promise<void> {
        try {
            await runTransaction(this.firestore, async (transaction: Transaction) => {
                // 1. Validar estoque de todos os itens (Reads)
                const productsToUpdate = [];
                for (const item of comanda.items) {
                    const productRef = doc(this.firestore, `products/${item.idProduct}`);
                    const productSnap = await transaction.get(productRef);

                    if (!productSnap.exists()) throw new Error(`Produto não encontrado: ${item.idProduct}`);

                    const currentStock = productSnap.data()['stock'] || 0;
                    if (currentStock < item.quantity) {
                        throw new Error(`Estoque insuficiente para ${item.productName}`);
                    }

                    productsToUpdate.push({ ref: productRef, quantity: item.quantity });
                }

                // 2. Atualizar estoque (Writes)
                for (const p of productsToUpdate) {
                    transaction.update(p.ref, { stock: increment(-p.quantity) });
                }

                // 3. Criar a Comanda
                const comandaCol = collection(this.firestore, this.COLLECTION_NAME);
                const newComandaRef = doc(comandaCol);
                transaction.set(newComandaRef, {
                    ...comanda,
                    status: 'open',
                    createdAt: serverTimestamp()
                });
            });
        } catch (error) {
            console.error("Erro ao adicionar comanda:", error);
            throw error;
        }
    }

    async addToExistingComanda(comandaId: string, itemsToAdd: any[], totalToAdd: number): Promise<void> {
        try {
            await runTransaction(this.firestore, async (transaction: Transaction) => {
                // 1. Validar estoque e ler comanda atual
                const comandaRef = doc(this.firestore, `${this.COLLECTION_NAME}/${comandaId}`);
                const comandaSnap = await transaction.get(comandaRef);
                if (!comandaSnap.exists()) throw new Error('Comanda não encontrada');

                const currentComanda = comandaSnap.data() as Comanda;

                const productsToUpdate = [];
                for (const item of itemsToAdd) {
                    const productRef = doc(this.firestore, `products/${item.idProduct}`);
                    const productSnap = await transaction.get(productRef);
                    if (!productSnap.exists()) throw new Error(`Produto não encontrado: ${item.idProduct}`);
                    const currentStock = productSnap.data()['stock'] || 0;
                    if (currentStock < item.quantity) throw new Error(`Estoque insuficiente para ${item.productName}`);

                    productsToUpdate.push({ ref: productRef, quantity: item.quantity });
                }

                // 2. Atualizar estoques
                for (const p of productsToUpdate) {
                    transaction.update(p.ref, { stock: increment(-p.quantity) });
                }

                // 3. Mesclar itens e atualizar comanda
                const updatedItems = [...currentComanda.items];
                itemsToAdd.forEach(newItem => {
                    const existing = updatedItems.find(i => i.idProduct === newItem.idProduct);
                    if (existing) {
                        existing.quantity += newItem.quantity;
                    } else {
                        updatedItems.push(newItem);
                    }
                });

                transaction.update(comandaRef, {
                    items: updatedItems,
                    total: currentComanda.total + totalToAdd
                });
            });
        } catch (error) {
            console.error("Erro ao adicionar à comanda existente:", error);
            throw error;
        }
    }

    async deleteComanda(comandaId: string): Promise<void> {
        try {
            await runTransaction(this.firestore, async (transaction: Transaction) => {
                const comandaRef = doc(this.firestore, `${this.COLLECTION_NAME}/${comandaId}`);
                const comandaSnap = await transaction.get(comandaRef);

                if (!comandaSnap.exists()) throw new Error('Comanda não encontrada');

                const comanda = comandaSnap.data() as Comanda;

                // Devolver itens ao estoque
                if (comanda.items && comanda.items.length > 0) {
                    for (const item of comanda.items) {
                        const productRef = doc(this.firestore, `products/${item.idProduct}`);
                        transaction.update(productRef, { stock: increment(item.quantity) });
                    }
                }

                // Excluir a comanda
                transaction.delete(comandaRef);
            });
        } catch (error) {
            console.error("Erro ao excluir comanda:", error);
            throw error;
        }
    }

    updateComanda(id: string, data: Partial<Comanda>): Promise<void> {
        const comandaDoc = doc(this.firestore, `${this.COLLECTION_NAME}/${id}`);
        return updateDoc(comandaDoc, data);
    }

    closeComanda(id: string): Promise<void> {
        const comandaDoc = doc(this.firestore, `${this.COLLECTION_NAME}/${id}`);
        return updateDoc(comandaDoc, { status: 'closed', closedAt: serverTimestamp() });
    }
}
