import { ChangeDetectionStrategy, Component, Input, OnChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, map } from 'rxjs';

import { RecurringOrder } from '../../models/recurring-order-model';
import { NotificationService } from '../../services/notification-service/notification.service';
import { RecurringOrderService } from '../../services/recurring-order-service/recurring-order-service';
import { notificarErroDoModelo } from '../order-recurrence/recurrence-errors';
import {
  RecurringOrderView, montarLinhaRecorrente, rotuloDaProximaData
} from '../order-recurrence/recurring-order-view';

export interface LinhaDeRecorrente {
  id: string;
  view: RecurringOrderView;
  /** Texto da proxima data; vazio so quando o modelo esta encerrado. */
  proximaData: string;
}

/**
 * Lista de leitura "Pedidos recorrentes deste cliente" (regra-de-negocio.md secao 5.4).
 * So apresenta o que recurring-order-view monta; edicao completa fica na pill Recorrentes.
 */
@Component({
  selector: 'app-customer-recurring-orders',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './customer-recurring-orders.html',
  styleUrls: ['./customer-recurring-orders.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CustomerRecurringOrdersComponent implements OnChanges {
  @Input({ required: true }) customerId = '';

  linhas$!: Observable<LinhaDeRecorrente[]>;
  emAcao: string | null = null;

  private service = inject(RecurringOrderService);
  private notif = inject(NotificationService);

  ngOnChanges(): void {
    this.linhas$ = this.service.getByCustomer(this.customerId).pipe(
      map(modelos => modelos.filter(temId).map(paraLinha))
    );
  }

  async pausar(id: string): Promise<void> {
    await this.executar(() => this.service.pause(id), id, 'Pedido recorrente pausado.');
  }

  async retomar(id: string): Promise<void> {
    await this.executar(() => this.service.resume(id), id, 'Pedido recorrente retomado.');
  }

  trackById(_: number, linha: LinhaDeRecorrente): string {
    return linha.id;
  }

  private async executar(acao: () => Promise<void>, id: string, sucesso: string): Promise<void> {
    this.emAcao = id;
    try {
      await acao();
      this.notif.success(sucesso);
    } catch (erro) {
      notificarErroDoModelo(this.notif, erro);
    } finally {
      this.emAcao = null;
    }
  }
}

function temId(modelo: RecurringOrder): modelo is RecurringOrder & { id: string } {
  return modelo.id !== undefined;
}

function paraLinha(modelo: RecurringOrder & { id: string }): LinhaDeRecorrente {
  const agora = new Date();
  return {
    id: modelo.id,
    view: montarLinhaRecorrente(modelo, agora),
    proximaData: modelo.status === 'ended' ? '' : rotuloDaProximaData(modelo, agora)
  };
}
