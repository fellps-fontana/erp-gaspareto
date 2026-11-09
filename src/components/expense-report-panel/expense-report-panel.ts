import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import {
  DateKey,
  Expense,
  ExpenseCategory,
  ExpenseCategoryType,
  MonthKey,
} from '../../models/expense-model';
import {
  CategoryBreakdownRow,
  ExpenseReportService,
  MonthlyBucket,
} from '../../services/expense-report-service/expense-report-service';

Chart.register(...registerables);

const PALETA_GRAFICO = [
  '#f4c042',
  '#3498db',
  '#2ecc71',
  '#e74c3c',
  '#9b59b6',
  '#f39c12',
  '#00FF7F',
];
const COR_EIXO = '#888';
const COR_GRADE = 'rgba(255,255,255,0.05)';
const COR_OPERACIONAL = '#f4c042';
const COR_CUSTO_PRODUCAO = '#3498db';
const ROTULO_TIPO: Record<ExpenseCategoryType, string> = {
  despesa_operacional: 'Operacional',
  custo_producao: 'Custo de produção',
};
const NOMES_MES = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

export interface LinhaLegenda extends CategoryBreakdownRow {
  cor: string;
  rotuloTipo: string;
}

@Component({
  selector: 'app-expense-report-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './expense-report-panel.html',
  styleUrl: './expense-report-panel.css',
})
export class ExpenseReportPanelComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() expenses: Expense[] = [];
  @Input() categories: ExpenseCategory[] = [];
  @Input() start: DateKey = '';
  @Input() end: DateKey = '';
  @Input() endMonth: MonthKey = '';

  @ViewChild('pizzaCanvas') pizzaCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('barrasCanvas') barrasCanvas?: ElementRef<HTMLCanvasElement>;

  legenda: LinhaLegenda[] = [];
  meses: MonthlyBucket[] = [];

  private pizzaChart?: Chart;
  private barrasChart?: Chart;
  private viewPronta = false;

  ngAfterViewInit(): void {
    this.viewPronta = true;
    this.atualizar();
  }

  ngOnChanges(): void {
    this.atualizar();
  }

  ngOnDestroy(): void {
    this.destruirCharts();
  }

  get semDados(): boolean {
    return this.legenda.length === 0;
  }

  private atualizar(): void {
    this.legenda = this.montarLegenda();
    this.meses = this.endMonth
      ? ExpenseReportService.monthlyTotals(this.expenses, this.categories, this.endMonth)
      : [];
    if (!this.viewPronta) return;
    this.destruirCharts();
    this.renderPizza();
    this.renderBarras();
  }

  private montarLegenda(): LinhaLegenda[] {
    if (!this.start || !this.end) return [];
    return ExpenseReportService.breakdownPorCategoria(
      this.expenses,
      this.categories,
      this.start,
      this.end,
    ).map((linha, indice) => ({
      ...linha,
      cor: PALETA_GRAFICO[indice % PALETA_GRAFICO.length],
      rotuloTipo: ROTULO_TIPO[linha.type],
    }));
  }

  private destruirCharts(): void {
    this.pizzaChart?.destroy();
    this.barrasChart?.destroy();
    this.pizzaChart = undefined;
    this.barrasChart = undefined;
  }

  private renderPizza(): void {
    const ctx = this.pizzaCanvas?.nativeElement;
    if (!ctx || this.semDados) return;
    this.pizzaChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: this.legenda.map((l) => `${l.name} (${l.rotuloTipo})`),
        datasets: [
          {
            data: this.legenda.map((l) => l.total),
            backgroundColor: this.legenda.map((l) => l.cor),
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
      },
    });
  }

  private renderBarras(): void {
    const ctx = this.barrasCanvas?.nativeElement;
    if (!ctx || this.meses.length === 0) return;
    this.barrasChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: this.meses.map((m) => rotuloMes(m.monthKey)),
        datasets: [
          {
            label: ROTULO_TIPO.despesa_operacional,
            data: this.meses.map((m) => m.operacional),
            backgroundColor: COR_OPERACIONAL,
            borderRadius: 6,
          },
          {
            label: ROTULO_TIPO.custo_producao,
            data: this.meses.map((m) => m.custoProducao),
            backgroundColor: COR_CUSTO_PRODUCAO,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: COR_EIXO } } },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: COR_EIXO } },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: { color: COR_GRADE },
            ticks: { color: COR_EIXO },
          },
        },
      },
    });
  }
}

function rotuloMes(monthKey: MonthKey): string {
  const [ano, mes] = monthKey.split('-').map(Number);
  return `${NOMES_MES[mes - 1]}/${String(ano).slice(2)}`;
}
