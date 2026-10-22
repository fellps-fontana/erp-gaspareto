import { CommonModule } from '@angular/common';
import { Component, DestroyRef, HostListener, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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

type ExpensesView = 'lista' | 'formulario' | 'categorias';
type GroupKey = 'vencidas' | 'aVencer' | 'pagas';

interface GroupView {
  key: GroupKey;
  title: string;
  items: Expense[];
}

const EMPTY_GROUPS: MonthGroups = {
  vencidas: [],
  aVencer: [],
  pagas: [],
  totals: { vencidas: 0, aPagarNoMes: 0, pagoNoMes: 0 },
};

const GROUP_TITLES: Record<GroupKey, string> = {
  vencidas: 'Vencidas',
  aVencer: 'A vencer',
  pagas: 'Pagas',
};

const GROUP_KEYS: GroupKey[] = ['vencidas', 'aVencer', 'pagas'];

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
export class ExpensesComponent implements OnInit {
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

  filtrosAbertos = false;
  menuAbertoId: string | null = null;

  grupos: MonthGroups = EMPTY_GROUPS;
  gruposVisiveis: GroupView[] = [];
  categoryIdsInUse: ReadonlySet<string> = new Set<string>();
  despesaEmEdicao: Expense | null = null;

  despesaParaPagar: Expense | null = null;
  dataPagamento: DateKey = '';
  formaPagamento: PaymentMethod | '' = '';

  despesaParaExcluir: Expense | null = null;
  despesaParaEncerrar: Expense | null = null;

  private despesas: Expense[] = [];
  private series: ExpenseSeries[] = [];
  private categoriaPorId = new Map<string, ExpenseCategory>();

  async ngOnInit(): Promise<void> {
    this.assinarDados();
    await this.prepararCategorias();
    await this.gerarRecorrencias();
  }

  get rotuloMes(): string {
    const [ano, mesNumero] = this.mes.split('-').map(Number);
    return new Date(ano, mesNumero - 1, 1).toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });
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

  get quantidadeFiltrosAtivos(): number {
    return [
      !!this.filtroCategoria,
      this.filtroStatus !== 'todos',
      this.filtroAPagarJaRecebida,
      this.filtroRevisar,
    ].filter(Boolean).length;
  }

  /** Total do grupo vem do servico; com filtro ativo ele nao representa a lista, entao some. */
  totalDoGrupo(key: GroupKey): number | null {
    if (this.filtrosAtivos) {
      return null;
    }
    const totais = this.grupos.totals;
    if (key === 'vencidas') {
      return totais.vencidas;
    }
    return key === 'aVencer' ? totais.aPagarNoMes : totais.pagoNoMes;
  }

  alternarFiltros(): void {
    this.filtrosAbertos = !this.filtrosAbertos;
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
    return this.gruposVisiveis.reduce((soma, g) => soma + g.items.length, 0);
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
    this.gruposVisiveis = GROUP_KEYS.map((key) => ({
      key,
      title: GROUP_TITLES[key],
      items: ExpenseReportService.applyFilters(this.grupos[key], filtros),
    }));
    const emUso = new Set<string>(this.despesas.map((d) => d.categoryId));
    this.series.forEach((s) => emUso.add(s.template.categoryId));
    this.categoryIdsInUse = emUso;
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
