import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, updateDoc, query, where, orderBy, serverTimestamp, runTransaction, increment, Transaction } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Comanda } from '../../models/comanda-model';

@Injectable({
    providedIn: 'root'
})
export class ComandaService {
    private firestore = inject(Firestore);
    private readonly COLLECTION_NAME = 'comandas';

    getOpenComandas(): Observable<Comanda[]> {
        const comandaCol = collection(this.firestore, this.COLLECTION_NAME);
        const q = query(
            comandaCol,
            where('status', '==', 'open'),
            orderBy('createdAt', 'desc')
        );
        return collectionData(q, { idField: 'id' }) as Observable<Comanda[]>;
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

    updateComanda(id: string, data: Partial<Comanda>): Promise<void> {
        const comandaDoc = doc(this.firestore, `${this.COLLECTION_NAME}/${id}`);
        return updateDoc(comandaDoc, data);
    }

    closeComanda(id: string): Promise<void> {
        const comandaDoc = doc(this.firestore, `${this.COLLECTION_NAME}/${id}`);
        return updateDoc(comandaDoc, { status: 'closed', closedAt: serverTimestamp() });
    }
}
