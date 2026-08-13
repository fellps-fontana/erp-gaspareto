import { Injectable, inject, Optional } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  collection, getDocs, query, where, addDoc, Timestamp
} from 'firebase/firestore';
import { Bill } from '../../models/bill-model';

export interface RecurrenceCheckResult {
  generated: Bill[];
}

@Injectable({ providedIn: 'root' })
export class BillRecurrenceService {
  private readonly COL = 'bills';

  constructor(
    @Optional() private firestore?: Firestore
  ) {
    // Se não tiver injeção (testes de lógica pura), tentar via inject
    if (!this.firestore) {
      try {
        this.firestore = inject(Firestore);
      } catch {
        // Falha esperada em testes sem injection context
      }
    }
  }

  /**
   * Verifica as bills recurring=true vinculadas a um purchaseProductId da
   * empresa e, para cada série atrasada, gera só a ocorrência mais recente
   * (catch-up: não recria as ocorrências intermediárias perdidas).
   */
  async checkAndGenerateDueOccurrences(companyId: string): Promise<RecurrenceCheckResult> {
    if (!companyId) {
      throw new Error(
        'Não é possível verificar ocorrências de bills recorrentes sem ' +
        'uma empresa (companyId) associada à sessão atual.'
      );
    }

    const q = query(
      collection(this.firestore!, this.COL),
      where('companyId', '==', companyId),
      where('recurring', '==', true)
    );

    const snapshot = await getDocs(q);
    const bills = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Bill));

    // Filtrar bills com purchaseProductId preenchido
    const billsWithProductId = bills.filter(b => b.purchaseProductId);

    // Agrupar por purchaseProductId e obter a mais recente de cada série
    const latestByProductId = this.obterUltimaOcorrenciaPorPurchaseProduct(billsWithProductId);

    const now = new Date();
    const generated: Bill[] = [];

    for (const [_, bill] of latestByProductId) {
      if (!bill.dueDate || !bill.recurrencePeriod) continue;

      const dueDate = bill.dueDate instanceof Timestamp
        ? bill.dueDate.toDate()
        : bill.dueDate as Date;

      // Só gera se a data já passou
      if (dueDate < now) {
        const nextDueDate = this.calcularProximaDataVencimento(
          dueDate,
          bill.recurrencePeriod
        );

        const newBill: Omit<Bill, 'id'> = {
          companyId: bill.companyId,
          name: bill.name,
          value: bill.value,
          dueDate: Timestamp.fromDate(nextDueDate),
          status: 'pendente',
          recurring: bill.recurring,
          recurrencePeriod: bill.recurrencePeriod,
          purchaseProductId: bill.purchaseProductId,
          createdAt: Timestamp.now()
        };

        const ref = await addDoc(collection(this.firestore!, this.COL), newBill);
        generated.push({
          ...newBill,
          id: ref.id
        });
      }
    }

    return { generated };
  }

  /**
   * Regra pura: próxima data de vencimento = última data conhecida + período
   * (âncora + período — preserva o dia do calendário mesmo se o check rodar
   * atrasado; nunca "hoje + período").
   */
  calcularProximaDataVencimento(
    ultimaData: Date,
    period: NonNullable<Bill['recurrencePeriod']>
  ): Date {
    const newDate = new Date(ultimaData);

    if (period === 'semanal') {
      newDate.setDate(newDate.getDate() + 7);
    } else if (period === 'mensal') {
      const originalDay = ultimaData.getDate();
      const originalHours = ultimaData.getHours();
      const originalMinutes = ultimaData.getMinutes();
      const originalSeconds = ultimaData.getSeconds();
      const originalMs = ultimaData.getMilliseconds();

      let targetMonth = ultimaData.getMonth() + 1;
      let targetYear = ultimaData.getFullYear();

      if (targetMonth > 11) {
        targetMonth = 0;
        targetYear += 1;
      }

      // Calcular o máximo de dias no mês alvo
      const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

      // Se o dia original é maior que os dias do mês alvo, usar o último dia
      const dayToSet = Math.min(originalDay, daysInTargetMonth);

      newDate.setFullYear(targetYear);
      newDate.setMonth(targetMonth, dayToSet);
      newDate.setHours(originalHours, originalMinutes, originalSeconds, originalMs);
    }

    return newDate;
  }

  private obterUltimaOcorrenciaPorPurchaseProduct(bills: Bill[]): Map<string, Bill> {
    const map = new Map<string, Bill>();

    for (const bill of bills) {
      if (!bill.purchaseProductId) continue;

      const existing = map.get(bill.purchaseProductId);
      if (!existing) {
        map.set(bill.purchaseProductId, bill);
      } else {
        // Comparar dueDate; se ausente, usar createdAt como fallback
        const billDate = this.toDate(bill.dueDate || bill.createdAt);
        const existingDate = this.toDate(existing.dueDate || existing.createdAt);

        if (billDate > existingDate) {
          map.set(bill.purchaseProductId, bill);
        }
      }
    }

    return map;
  }

  private toDate(timestamp: Timestamp | Date | undefined): Date {
    if (!timestamp) return new Date(0);
    if (timestamp instanceof Timestamp) return timestamp.toDate();
    return timestamp as Date;
  }
}
