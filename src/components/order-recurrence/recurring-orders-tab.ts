import { Component, EventEmitter, HostListener, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

import { RecurringOrder } from '../../models/recurring-order-model';
import { RecurringOrderView, montarLinhaRecorrente } from './recurring-order-view';

/**
 * Aba "Recorrentes" (regra-de-negocio.md secao 5.4): so apresenta os modelos e emite as acoes;
 * quem chama o service e o pai. "Encerrar" e definitivo e pede confirmacao em modal proprio.
 */
@Component({
  selector: 'app-recurring-orders-tab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './recurring-orders-tab.html',
  styleUrls: ['./recurring-orders-tab.css']
})
export class RecurringOrdersTabComponent implements OnChanges {
  @Input() models: readonly RecurringOrder[] = [];
  @Input() processing = false;

  @Output() pause = new EventEmitter<RecurringOrder>();
  @Output() resume = new EventEmitter<RecurringOrder>();
  @Output() end = new EventEmitter<RecurringOrder>();
  @Output() edit = new EventEmitter<RecurringOrder>();

  rows: RecurringOrderView[] = [];
  endTarget: RecurringOrder | null = null;

  ngOnChanges(): void {
    this.rows = this.models.map(model => montarLinhaRecorrente(model));
  }

  trackByModel(_: number, row: RecurringOrderView): string {
    return row.model.id ?? row.customerName;
  }

  askEnd(model: RecurringOrder): void { this.endTarget = model; }

  closeEndConfirm(): void { this.endTarget = null; }

  confirmEnd(): void {
    if (!this.endTarget) return;
    this.end.emit(this.endTarget);
    this.endTarget = null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.closeEndConfirm(); }
}
