import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

import { Order } from '../../models/order-model';
import {
  AbaAReceber,
  ParcelaReceber,
  montarAbaAReceber
} from '../../services/order-service/order-receivables-rules';

export interface RecebiParcelaEvent {
  order: Order;
  parcela: ParcelaReceber;
}

/**
 * Aba "A receber" (regra-de-negocio.md seção 5.3): só apresenta o que
 * montarAbaAReceber devolve — nenhum total ou agrupamento é calculado aqui.
 */
@Component({
  selector: 'app-order-receivables',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './order-receivables.html',
  styleUrls: ['./order-receivables.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrderReceivablesComponent implements OnChanges {
  /** Todos os pedidos da empresa (não só o kanban): parcelados saem do kanban. */
  @Input() orders: readonly Order[] = [];
  /** Referência de "hoje"; default = agora. */
  @Input() hoje: Date | null = null;

  @Output() receive = new EventEmitter<RecebiParcelaEvent>();
  @Output() openOrder = new EventEmitter<Order>();

  aba: AbaAReceber = montarAbaAReceber([], new Date());

  ngOnChanges(): void {
    this.aba = montarAbaAReceber(this.orders, this.hoje ?? new Date());
  }

  get isEmpty(): boolean {
    return this.aba.vencidas.length + this.aba.esteMes.length + this.aba.proximosMeses.length === 0;
  }

  atrasoLabel(parcela: ParcelaReceber): string {
    return parcela.diasAtraso === 1 ? 'venceu há 1 dia' : `venceu há ${parcela.diasAtraso} dias`;
  }

  onReceive(parcela: ParcelaReceber): void {
    const order = this.findOrder(parcela);
    if (order) this.receive.emit({ order, parcela });
  }

  onOpenCustomer(parcela: ParcelaReceber): void {
    const order = this.findOrder(parcela);
    if (order) this.openOrder.emit(order);
  }

  trackByParcela(_: number, parcela: ParcelaReceber): string {
    return `${parcela.orderId}:${parcela.paymentId}`;
  }

  private findOrder(parcela: ParcelaReceber): Order | undefined {
    return this.orders.find(o => o.id === parcela.orderId);
  }
}
