import { Component, EventEmitter, HostListener, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DateKey, Expense, ExpenseCategory } from '../../models/expense-model';
import {
  CategoryBreakdownRow,
  ExpenseReportService,
} from '../../services/expense-report-service/expense-report-service';

const PERCENT_BASE = 100;

export interface LinhaGasto extends CategoryBreakdownRow {
  percentual: number;
}

@Component({
  selector: 'app-gastos-breakdown-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gastos-breakdown-modal.html',
  styleUrl: './gastos-breakdown-modal.css',
})
export class GastosBreakdownModalComponent implements OnChanges {
  @Input() expenses: Expense[] = [];
  @Input() categories: ExpenseCategory[] = [];
  @Input() start: DateKey = '';
  @Input() end: DateKey = '';
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();

  operacionais: LinhaGasto[] = [];
  totalOperacional = 0;
  totalCustoProducao = 0;

  ngOnChanges(): void {
    if (!this.start || !this.end) {
      this.operacionais = [];
      this.totalOperacional = 0;
      this.totalCustoProducao = 0;
      return;
    }
    this.totalOperacional = ExpenseReportService.sumOperacionalPorVencimento(
      this.expenses,
      this.categories,
      this.start,
      this.end,
    );
    this.totalCustoProducao = ExpenseReportService.sumCustoProducaoPorVencimento(
      this.expenses,
      this.categories,
      this.start,
      this.end,
    );
    this.operacionais = ExpenseReportService.breakdownPorCategoria(
      this.expenses,
      this.categories,
      this.start,
      this.end,
      'despesa_operacional',
    ).map((linha) => ({ ...linha, percentual: participacao(linha.total, this.totalOperacional) }));
  }

  @HostListener('document:keydown.escape')
  aoPressionarEsc(): void {
    if (this.open) this.fechar();
  }

  fechar(): void {
    this.closed.emit();
  }
}

function participacao(parte: number, total: number): number {
  return total > 0 ? (parte / total) * PERCENT_BASE : 0;
}
