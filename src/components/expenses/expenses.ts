import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import {
  DateKey,
  Expense,
  ExpenseCategory,
  ExpenseSeries,
  ExpenseStatus,
  MonthKey,
} from '../../models/expense-model';
import { PAYMENT_METHOD_LABELS, PaymentMethod } from '../../models/sell-model';
import { ExpenseCategoryService } from '../../services/expense-category-service/expense-category-service';
import { ExpenseRecurrenceService } from '../../services/expense-recurrence-service/expense-recurrence-service';
import {
  ExpenseFilters,
  ExpenseReportService,
  MonthGroups,
  SEM_CATEGORIA_LABEL,
} from '../../services/expense-report-service/expense-report-service';
import { ExpenseScheduleService } from '../../services/expense-schedule-service/expense-schedule-service';
import { ExpenseService } from '../../services/expense-service/expense-service';
import { NotificationService } from '../../services/notification-service/notification.service';
import { TenantService } from '../../services/tenant-service/tenant-service';
import { ExpenseCategoryManagerComponent } from '../expense-category-manager/expense-category-manager';
import { ExpenseFormComponent, ExpenseFormSaveEvent } from '../expense-form/expense-form';

Chart.register(...registerables);

type ExpensesView = 'lista' | 'formulario' | 'categorias';
type ChipKey = 'todas' | 'a_pagar' | 'pagas' | 'recebidas' | 'revisar';

interface DiaView {
  chave: DateKey;
  rotulo: string;
  items: Expense[];
}

interface FatiaCategoria {
  categoryId: string;
  name: string;
  total: number;
  percentual: number;
  cor: string;
}

interface ChipView {
  key: ChipKey;
  label: string;
}

const EMPTY_GROUPS: MonthGroups = {
  vencidas: [],
  aVencer: [],
  pagas: [],
  totals: { vencidas: 0, aPagarNoMes: 0, pagoNoMes: 0 },
};

// Apresentacao: icone por categoria padrao (systemKey) e paleta fixa de cores suaves
const ICONES_CATEGORIA: Record<string, string> = {
  compra_mercadoria: '🛒',
  insumos_embalagem: '📦',
  aluguel: '🏠',
  energia_agua_gas: '💡',
  internet_telefone: '📶',
  transporte_combustivel: '⛽',
  pessoal: '👥',
  impostos_taxas: '🧾',
  taxas_cartao: '💳',
  marketing: '📣',
  manutencao_equipamentos: '🔧',
  outros: '📌',
};

const PALETA_CATEGORIAS = [
  '#e57373',
  '#f2994a',
  '#f4c042',
  '#81c784',
  '#4db6ac',
  '#4fc3f7',
  '#7986cb',
  '#ba68c8',
  '#f06292',
  '#a1887f',
  '#90a4ae',
  '#aed581',
];

const CHIPS: ChipView[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'a_pagar', label: 'A pagar' },
  { key: 'pagas', label: 'Pagas' },
  { key: 'recebidas', label: 'Já recebidas' },
  { key: 'revisar', label: 'Revisar' },
];

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ExpenseFormComponent,
    ExpenseCategoryManagerComponent,
  ],
  templateUrl: './expenses.html',
  styleUrls: ['./expenses.css', './expenses-mobile.css'],
})
export class ExpensesComponent implements OnInit, OnDestroy {
  private expenseService = inject(ExpenseService);
  private categoryService = inject(ExpenseCategoryService);
  private recurrenceService = inject(ExpenseRecurrenceService);
  private tenantService = inject(TenantService);
  private notif = inject(NotificationService);
  private destroyRef = inject(DestroyRef);

  readonly paymentMethods = Object.values(PaymentMethod).map((valor) => ({
    value: valor,
    label: PAYMENT_METHOD_LABELS[valor],
  }));
  readonly paymentLabels = PAYMENT_METHOD_LABELS;

  view: ExpensesView = 'lista';
  categorias: ExpenseCategory[] = [];
  categoriasProntas = false;

  hoje: DateKey = ExpenseScheduleService.toDateKey(new Date());
  mes: MonthKey = ExpenseScheduleService.monthKeyOf(this.hoje);

  filtroCategoria = '';
  filtroStatus: ExpenseStatus | 'todos' = 'todos';
  filtroAPagarJaRecebida = false;
  filtroRevisar = false;

  readonly chips = CHIPS;
  menuAbertoId: string | null = null;

  grupos: MonthGroups = EMPTY_GROUPS;
  vencidasVisiveis: Expense[] = [];
  dias: DiaView[] = [];
  fatias: FatiaCategoria[] = [];
  categoryIdsInUse: ReadonlySet<string> = new Set<string>();
  despesaEmEdicao: Expense | null = null;

  despesaParaPagar: Expense | null = null;
  dataPagamento: DateKey = '';
  formaPagamento: PaymentMethod | '' = '';

  despesaParaExcluir: Expense | null = null;
  despesaParaEncerrar: Expense | null = null;

  private roscaCanvas?: ElementRef<HTMLCanvasElement>;
  private rosca?: Chart;
  private despesas: Expense[] = [];
  private series: ExpenseSeries[] = [];
  private categoriaPorId = new Map<string, ExpenseCategory>();

  @ViewChild('roscaCanvas') set roscaRef(ref: ElementRef<HTMLCanvasElement> | undefined) {
    this.roscaCanvas = ref;
    this.desenharRosca();
  }

  async ngOnInit(): Promise<void> {
    this.assinarDados();
    await this.prepararCategorias();
    await this.gerarRecorrencias();
  }

  ngOnDestroy(): void {
    this.rosca?.destroy();
    this.rosca = undefined;
  }

  get nomeMes(): string {
    const [ano, mesNumero] = this.mes.split('-').map(Number);
    return new Date(ano, mesNumero - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
  }

  get rotuloMes(): string {
    return `${this.nomeMes} ${this.mes.split('-')[0]}`;
  }

  /** Soma de dois totais ja calculados pelo service (apresentacao). */
  get totalDoMes(): number {
    const { aPagarNoMes, pagoNoMes } = this.grupos.totals;
    return Math.round((aPagarNoMes + pagoNoMes) * 100) / 100;
  }

  get ehMesCorrente(): boolean {
    return this.mes === ExpenseScheduleService.monthKeyOf(this.hoje);
  }

  get filtrosAtivos(): boolean {
    return (
      !!this.filtroCategoria ||
      this.filtroStatus !== 'todos' ||
      this.filtroAPagarJaRecebida ||
      this.filtroRevisar
    );
  }

  chipAtivo(chave: ChipKey): boolean {
    switch (chave) {
      case 'a_pagar':
        return (
          this.filtroStatus === 'a_pagar' && !this.filtroAPagarJaRecebida && !this.filtroRevisar
        );
      case 'pagas':
        return this.filtroStatus === 'pago';
      case 'recebidas':
        return this.filtroAPagarJaRecebida;
      case 'revisar':
        return this.filtroRevisar;
      default:
        return this.filtroStatus === 'todos' && !this.filtroAPagarJaRecebida && !this.filtroRevisar;
    }
  }

  selecionarChip(chave: ChipKey): void {
    this.filtroStatus = chave === 'a_pagar' ? 'a_pagar' : chave === 'pagas' ? 'pago' : 'todos';
    this.filtroAPagarJaRecebida = chave === 'recebidas';
    this.filtroRevisar = chave === 'revisar';
    this.recalcular();
  }

  rotuloPagamento(despesa: Expense): string {
    return despesa.paymentMethod ? this.paymentLabels[despesa.paymentMethod] : '';
  }

  iconeCategoria(id: string): string {
    const categoria = this.categoriaPorId.get(id);
    if (categoria?.systemKey && ICONES_CATEGORIA[categoria.systemKey]) {
      return ICONES_CATEGORIA[categoria.systemKey];
    }
    return (categoria?.name ?? '?').trim().charAt(0).toUpperCase() || '?';
  }

  corCategoria(id: string): string {
    const chave = this.categoriaPorId.get(id)?.systemKey ?? id;
    let hash = 0;
    for (const caractere of chave) {
      hash = (hash * 31 + caractere.charCodeAt(0)) >>> 0;
    }
    return PALETA_CATEGORIAS[hash % PALETA_CATEGORIAS.length];
  }

  alternarMenu(despesa: Expense, evento: Event): void {
    evento.stopPropagation();
    this.menuAbertoId = this.menuAbertoId === despesa.id ? null : (despesa.id ?? null);
  }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  fecharMenu(): void {
    this.menuAbertoId = null;
  }

  get totalVisivel(): number {
    return this.dias.reduce((soma, d) => soma + d.items.length, this.vencidasVisiveis.length);
  }

  mudarMes(delta: number): void {
    const base: DateKey = `${this.mes}-01`;
    this.mes = ExpenseScheduleService.monthKeyOf(
      ExpenseScheduleService.addMonthsClamped(base, delta),
    );
    this.recalcular();
  }

  irParaMesCorrente(): void {
    this.mes = ExpenseScheduleService.monthKeyOf(this.hoje);
    this.recalcular();
  }

  aoMudarFiltro(): void {
    this.recalcular();
  }

  limparFiltros(): void {
    this.filtroCategoria = '';
    this.filtroStatus = 'todos';
    this.filtroAPagarJaRecebida = false;
    this.filtroRevisar = false;
    this.recalcular();
  }

  nomeCategoria(id: string): string {
    return this.categoriaPorId.get(id)?.name ?? SEM_CATEGORIA_LABEL;
  }

  ehCustoProducao(despesa: Expense): boolean {
    return this.categoriaPorId.get(despesa.categoryId)?.type === 'custo_producao';
  }

  podeMarcarChegada(despesa: Expense): boolean {
    return this.ehCustoProducao(despesa) && !despesa.goodsReceivedDate;
  }

  podeEncerrarSerie(despesa: Expense): boolean {
    return !!despesa.seriesId && this.series.some((s) => s.id === despesa.seriesId && s.active);
  }

  estaVencida(despesa: Expense): boolean {
    return ExpenseReportService.isOverdue(despesa, this.hoje);
  }

  formatarData(data?: DateKey): string {
    if (!data) {
      return '';
    }
    const [ano, mesNumero, dia] = data.split('-');
    return `${dia}/${mesNumero}/${ano}`;
  }

  abrirNovaDespesa(): void {
    if (!this.categoriasProntas) {
      return;
    }
    this.despesaEmEdicao = null;
    this.view = 'formulario';
  }

  editar(despesa: Expense): void {
    this.despesaEmEdicao = despesa;
    this.view = 'formulario';
  }

  abrirCategorias(): void {
    this.view = 'categorias';
  }

  voltarParaLista(): void {
    this.despesaEmEdicao = null;
    this.view = 'lista';
  }

  async salvarDespesa(evento: ExpenseFormSaveEvent): Promise<void> {
    const emEdicao = this.despesaEmEdicao;
    if (emEdicao && !emEdicao.id) {
      this.notif.warning('⚠️ Não foi possível identificar a despesa em edição');
      return;
    }
    await this.executar(async () => {
      if (emEdicao?.id) {
        await this.expenseService.updateExpense(emEdicao.id, evento.input);
      } else if (evento.mode === 'parcelada') {
        await this.expenseService.addInstallments(evento.input, evento.installments ?? 0);
      } else if (evento.mode === 'recorrente') {
        await this.recurrenceService.createSeries(
          evento.input,
          evento.period ?? 'mensal',
          this.hoje,
        );
      } else {
        await this.expenseService.addExpense(evento.input);
      }
      this.notif.success(emEdicao ? '✅ Despesa atualizada' : '✅ Despesa cadastrada');
      this.voltarParaLista();
    });
  }

  abrirPagamento(despesa: Expense): void {
    this.despesaParaPagar = despesa;
    this.dataPagamento = this.hoje;
    this.formaPagamento = despesa.paymentMethod ?? '';
  }

  fecharPagamento(): void {
    this.despesaParaPagar = null;
  }

  async confirmarPagamento(): Promise<void> {
    const id = this.despesaParaPagar?.id;
    if (!id) {
      return;
    }
    if (!this.dataPagamento) {
      this.notif.warning('⚠️ Informe a data do pagamento');
      return;
    }
    await this.executar(async () => {
      await this.expenseService.markAsPaid(
        id,
        this.dataPagamento,
        this.formaPagamento || undefined,
      );
      this.notif.success('✅ Pagamento registrado');
      this.fecharPagamento();
    });
  }

  async marcarChegada(despesa: Expense): Promise<void> {
    if (!despesa.id) {
      return;
    }
    const id = despesa.id;
    await this.executar(async () => {
      await this.expenseService.markGoodsReceived(id, this.hoje);
      this.notif.success('✅ Chegada da mercadoria registrada');
    });
  }

  abrirExclusao(despesa: Expense): void {
    this.despesaParaExcluir = despesa;
  }

  fecharExclusao(): void {
    this.despesaParaExcluir = null;
  }

  async confirmarExclusao(): Promise<void> {
    const id = this.despesaParaExcluir?.id;
    if (!id) {
      return;
    }
    await this.executar(async () => {
      await this.expenseService.deleteExpense(id);
      this.notif.success('✅ Despesa excluída');
      this.fecharExclusao();
    });
  }

  abrirEncerramento(despesa: Expense): void {
    this.despesaParaEncerrar = despesa;
  }

  fecharEncerramento(): void {
    this.despesaParaEncerrar = null;
  }

  async confirmarEncerramento(): Promise<void> {
    const seriesId = this.despesaParaEncerrar?.seriesId;
    if (!seriesId) {
      return;
    }
    await this.executar(async () => {
      await this.recurrenceService.endSeries(seriesId);
      this.notif.success('✅ Recorrência encerrada');
      this.fecharEncerramento();
    });
  }

  private assinarDados(): void {
    this.expenseService
      .getExpenses()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (lista) => {
          this.despesas = lista;
          this.recalcular();
        },
        error: (erro) => this.avisarErro(erro),
      });
    this.recurrenceService
      .getSeries()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (lista) => {
          this.series = lista;
          this.recalcular();
        },
        error: (erro) => this.avisarErro(erro),
      });
  }

  private async prepararCategorias(): Promise<void> {
    this.categoryService
      .getCategories()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (lista) => {
          this.categorias = lista;
          this.categoriaPorId = new Map(
            lista.filter((c) => !!c.id).map((c) => [c.id as string, c]),
          );
          this.recalcular();
        },
        error: (erro) => this.avisarErro(erro),
      });
    try {
      await this.categoryService.ensureDefaults();
      this.categoriasProntas = true;
    } catch (erro) {
      this.avisarErro(erro);
    }
  }

  private async gerarRecorrencias(): Promise<void> {
    const companyId = this.tenantService.companyId();
    if (!companyId) {
      return;
    }
    try {
      await this.recurrenceService.generateDueOccurrences(companyId, this.hoje);
    } catch (erro) {
      console.error('Erro ao gerar ocorrencias recorrentes:', erro);
      this.notif.warning('⚠️ Não foi possível verificar despesas recorrentes automaticamente');
    }
  }

  private recalcular(): void {
    this.grupos = ExpenseReportService.groupForMonth(this.despesas, this.mes, this.hoje);
    const filtros = this.montarFiltros();
    this.vencidasVisiveis = ExpenseReportService.applyFilters(this.grupos.vencidas, filtros);
    const doMes = ExpenseReportService.applyFilters(
      [...this.grupos.aVencer, ...this.grupos.pagas],
      filtros,
    );
    this.dias = this.agruparPorDia(doMes);
    const emUso = new Set<string>(this.despesas.map((d) => d.categoryId));
    this.series.forEach((s) => emUso.add(s.template.categoryId));
    this.categoryIdsInUse = emUso;
    this.fatias = this.montarFatias();
    this.desenharRosca();
  }

  /** Dia de agrupamento: pago usa paidDate (o que o coloca no mes); a pagar usa dueDate. */
  private diaDe(despesa: Expense): DateKey {
    return despesa.status === 'pago' && despesa.paidDate ? despesa.paidDate : despesa.dueDate;
  }

  private agruparPorDia(lista: Expense[]): DiaView[] {
    const ordenada = [...lista].sort((a, b) => this.diaDe(a).localeCompare(this.diaDe(b)));
    const dias: DiaView[] = [];
    for (const despesa of ordenada) {
      const dia = this.diaDe(despesa);
      const ultimo = dias[dias.length - 1];
      if (ultimo && ultimo.chave === dia) {
        ultimo.items.push(despesa);
      } else {
        dias.push({ chave: dia, rotulo: this.rotuloDia(dia), items: [despesa] });
      }
    }
    return dias;
  }

  private rotuloDia(data: DateKey): string {
    if (data === this.hoje) {
      return 'Hoje';
    }
    if (data === ExpenseScheduleService.addDays(this.hoje, 1)) {
      return 'Amanhã';
    }
    const [ano, mesNumero, dia] = data.split('-').map(Number);
    return new Date(ano, mesNumero - 1, dia).toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
    });
  }

  private montarFatias(): FatiaCategoria[] {
    const inicio: DateKey = `${this.mes}-01`;
    const linhas = ExpenseReportService.breakdownPorCategoria(
      this.despesas,
      this.categorias,
      inicio,
      ExpenseScheduleService.endOfMonth(inicio),
    );
    const soma = linhas.reduce((acc, l) => acc + l.total, 0);
    return linhas.map((l) => ({
      categoryId: l.categoryId,
      name: l.name,
      total: l.total,
      percentual: soma > 0 ? (l.total / soma) * 100 : 0,
      cor: this.corCategoria(l.categoryId),
    }));
  }

  private desenharRosca(): void {
    this.rosca?.destroy();
    this.rosca = undefined;
    const canvas = this.roscaCanvas?.nativeElement;
    if (!canvas || this.fatias.length === 0) {
      return;
    }
    this.rosca = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: this.fatias.map((f) => f.name),
        datasets: [
          {
            data: this.fatias.map((f) => f.total),
            backgroundColor: this.fatias.map((f) => f.cor),
            borderWidth: 0,
          },
        ],
      },
      options: {
        cutout: '65%',
        plugins: { legend: { display: false } },
        maintainAspectRatio: false,
      },
    });
  }

  private montarFiltros(): ExpenseFilters {
    return {
      categoryId: this.filtroCategoria || null,
      status: this.filtroStatus,
      apenasAPagarJaRecebida: this.filtroAPagarJaRecebida,
      apenasRevisar: this.filtroRevisar,
    };
  }

  private async executar(acao: () => Promise<void>): Promise<void> {
    try {
      await acao();
    } catch (erro) {
      this.avisarErro(erro);
    }
  }

  private avisarErro(erro: unknown): void {
    const mensagem = erro instanceof Error ? erro.message : 'Não foi possível concluir a operação';
    this.notif.warning(`⚠️ ${mensagem}`);
  }
}
