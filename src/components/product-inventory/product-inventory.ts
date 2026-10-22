import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { Observable, Subscription, of, combineLatest } from 'rxjs';

Chart.register(...registerables);

/** Qual dos três cards clicáveis do Relatório abriu o modal de detalhe. */
export type DetalheRelatorio = 'faturamento' | 'cmv' | 'lucro';
/** 'vendas' = filtros completos da aba Vendas; 'balanco' = só o período (aba Balanço). */
export type EscopoDetalhe = 'vendas' | 'balanco';

const TITULO_DETALHE: Record<DetalheRelatorio, string> = {
  faturamento: 'Faturamento',
  cmv: 'Custo (CMV)',
  lucro: 'Lucro Bruto'
};

/** Tokens (identidade-visual.md) usados em sequência nas fatias da pizza; 'Outros' usa --text-muted. */
const TOKENS_PALETA = ['--color-primary', '--color-info', '--color-secondary-dark', '--color-danger', '--color-warning'];

const CARDS_VAZIOS: CardsRelatorio = { faturamento: 0, custoTotal: 0, lucro: 0, qtdVendas: 0, margem: 0 };

// Models e Services
import { Product } from '../../models/product-model';
import { Customer } from '../../models/customer-model';
import { Expense, ExpenseCategory } from '../../models/expense-model';
import { Order } from '../../models/order-model';
import { Vendedor, ComissaoVendedorResultado } from '../../models/vendedor-model';
import { PaymentMethod, PAYMENT_METHOD_LABELS } from '../../models/sell-model';
import { ProductService } from '../../services/product-service/product-service';
import { SaleService } from '../../services/sale-service/sale-service';
import { PurchaseService } from '../../services/purchase-service/purchase-service';
import { CustomerService } from '../../services/customer-service/customer-service';
import { ExpenseService } from '../../services/expense-service/expense-service';
import { ExpenseCategoryService } from '../../services/expense-category-service/expense-category-service';
import { ExpenseRecurrenceService } from '../../services/expense-recurrence-service/expense-recurrence-service';
import { ExpenseScheduleService } from '../../services/expense-schedule-service/expense-schedule-service';
import { TenantService } from '../../services/tenant-service/tenant-service';
import {
  CategoryBreakdownRow,
  ExpenseReportService,
} from '../../services/expense-report-service/expense-report-service';
import { NotificationService } from '../../services/notification-service/notification.service';
import { ConfigService } from '../../services/config/config.service';
import { OrderService } from '../../services/order-service/order-service';
import { VendedorService } from '../../services/vendedor-service/vendedor-service';
import { ComandaService } from '../../services/comanda-service/comanda-service';
import { GeocodingService } from '../../services/geocoding-service/geocoding-service';
import { MapPickerComponent } from '../map-picker/map-picker';
import { ExpenseReportPanelComponent } from '../expense-report-panel/expense-report-panel';
import { GastosBreakdownModalComponent } from '../gastos-breakdown-modal/gastos-breakdown-modal';
import { CustomerRecurringOrdersComponent } from '../customer-recurring-orders/customer-recurring-orders';
import { filtrarPorTermo } from './busca-por-nome';
import { calcularTotalItemPorPeso } from '../../services/product-service/product-weight-rules';
import { MovimentoMes, PanoramaAnual, listarMovimentoDoMes, montarPanoramaAnual } from '../../services/order-service/order-receivables-rules';
import {
  CardsRelatorio, DetalheFaturamento, FatiaProduto, FiltroRelatorio, LinhaCmv, LinhaLucro, ModoTop,
  NomesClientes, OrigemVenda, ProdutosPorId, RankingQuantidade, VendaFiltrada, VendaRelatorio,
  calcularCards, filtrarVendas, filtroSomentePeriodo, modoTopEfetivo, montarDetalheCmv,
  montarDetalheFaturamento, montarDetalheLucro, rankingTopQuantidade, serieDiaria
} from '../../services/sale-service/sale-report-rules';

// --- HISTÓRICO GERAL: item de produto dentro de um lançamento unificado ---
// Snapshot preservado (priceAtSale/priceAtCost) igual Sale/Order/Comanda —
// é o que sustenta o cálculo de custo/lucro do detalhe do lançamento.
export interface HistoricoItemProduto {
  idProduct: string;
  productName: string;
  quantity: number;
  priceAtSale: number;
  priceAtCost: number; // snapshot no momento do lançamento — base do custo/lucro
  soldByWeight?: boolean; // snapshot: true = quantity representa peso em kg
}

// --- HISTÓRICO GERAL: item unificado das 3 origens (pdv/pedido/comanda) ---
// Não é uma coleção do Firestore, é só uma forma comum de exibir sales,
// orders e comandas juntos na mesma lista/filtro.
export interface HistoricoItem {
  id: string;
  numero?: number; // só existe pra origem 'pedido' — número sequencial por empresa
  origem: 'pdv' | 'pedido' | 'comanda';
  data: Date | null;
  clienteNome: string;
  clienteId?: string;
  status: string;
  total: number;
  paymentMethod?: PaymentMethod; // só pdv/pedido — comanda não tem
  installments?: number; // 1/ausente = à vista, N = parcelado — espelha Sale/Order.installments
  itens: HistoricoItemProduto[];
  // --- DETALHE DO LANÇAMENTO (modal aberto pelo card — ver abrirDetalheLancamento) ---
  itemsTotal: number; // subtotal só dos produtos, sem frete
  shippingCost: number; // só 'pedido' pode ser > 0; pdv/comanda não têm frete, sempre 0
  deliveryType?: 'pickup' | 'delivery'; // só 'pedido'
  address?: string; // só 'pedido' com deliveryType 'delivery'
  observations?: string; // só 'pedido', opcional
}

@Component({
  selector: 'app-estoque',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MapPickerComponent,
    CustomerRecurringOrdersComponent,
    ExpenseReportPanelComponent,
    GastosBreakdownModalComponent,
  ],
  templateUrl: './product-inventory.html',
  styleUrls: ['./product-inventory.css', './product-inventory-mobile.css']
})
export class ProductInventoryComponent implements OnInit, OnDestroy {
  readonly config = inject(ConfigService);
  private geocodingService = inject(GeocodingService);

  // Controle das Abas
  activeTab: 'relatorio' | 'estoque' | 'clientes' | 'historico' | 'vendedores' = 'relatorio';
  reportTab: 'vendas' | 'despesas' | 'balanco' | 'receber' | 'vendedores' = 'vendas';

  // Controle de Visualização do Formulário
  exibirFormularioNovo: boolean = false;
  produtoEmEdicao: Product | null = null;

  // Lista de produtos
  isLoading = true;
  products: Product[] = [];

  // --- FILTROS ---
  filtroDataInicio: string = '';
  filtroDataFim: string = '';
  filtroProdutoId: string = '';
  filtroOrigem: OrigemVenda | 'todos' = 'todos';
  filtroClienteId: string = '';
  filtroFormaPagamento: PaymentMethod | 'todos' = 'todos';
  filtrosRelatorioVisiveis: boolean = false;

  // --- MODAL DE EXCLUSÃO DE PRODUTO ---
  isDeleteModalOpen: boolean = false;
  productToDelete: Product | null = null;

  // --- DADOS DO RELATÓRIO ---
  // Números vêm de sale-report-rules (calcularCards); o componente só guarda e exibe.
  /** Snapshot cru de getSalesByDate — fonte única de onde tudo abaixo deriva. */
  vendasBase: VendaRelatorio[] = [];
  /** Vendas que passaram em todos os filtros da aba Vendas. */
  vendasFiltradas: VendaFiltrada[] = [];
  /** Vendas do período apenas (aba Balanço ignora produto/origem/cliente/forma). */
  vendasBalanco: VendaFiltrada[] = [];
  relatorio: CardsRelatorio = { ...CARDS_VAZIOS };
  relatorioBalanco: CardsRelatorio = { ...CARDS_VAZIOS };
  private vendasSub: Subscription | null = null;

  // --- MODAIS DE DETALHE (Faturamento / CMV / Lucro Bruto) ---
  detalheAberto: DetalheRelatorio | null = null;
  detalheEscopo: EscopoDetalhe = 'vendas';
  detalheFaturamento: DetalheFaturamento | null = null;
  linhasCmv: LinhaCmv[] = [];
  linhasLucro: LinhaLucro[] = [];
  /** Quantas linhas do CMV têm custo zero (aviso no topo do modal). */
  cmvLinhasSemCusto = 0;
  /** Texto do período e filtros ativos do escopo aberto (cabeçalho do modal). */
  detalhePeriodo = '';
  detalheFiltrosAtivos: string[] = [];
  /** Cor de cada fatia da pizza (mesma ordem de fatias), resolvida dos tokens. */
  coresPizza: string[] = [];
  faturamentoPizzaChart: Chart | null = null;
  faturamentoDiaChart: Chart | null = null;

  // --- TOP 5 (unidade e kg nunca se misturam) ---
  topModo: ModoTop = 'unidade';
  ranking: RankingQuantidade = { unidade: [], peso: [] };

  // --- SUB-ABA A RECEBER (panorama anual; números vêm de order-receivables-rules) ---
  readonly mesesAbreviados = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  private static readonly ANOS_PANORAMA_PARA_TRAS = 3;
  private static readonly ANOS_PANORAMA_PARA_FRENTE = 2;
  readonly anosPanorama: number[] = Array.from(
    { length: ProductInventoryComponent.ANOS_PANORAMA_PARA_TRAS + ProductInventoryComponent.ANOS_PANORAMA_PARA_FRENTE + 1 },
    (_, i) => new Date().getFullYear() - ProductInventoryComponent.ANOS_PANORAMA_PARA_TRAS + i
  );
  anoPanorama: number = new Date().getFullYear();
  panorama: PanoramaAnual | null = null;
  receberChart: Chart | null = null;
  /** Mês (0-11) aberto no modal de movimento; null = modal fechado. */
  mesDetalheAberto: number | null = null;
  movimentosMesDetalhe: MovimentoMes[] = [];

  // --- CHART INSTANCES ---
  salesChart: Chart | null = null;
  topProductsChart: Chart | null = null;

  // --- DADOS PARA CADASTRO / EDIÇÃO (CAMPOS NOVOS ADICIONADOS) ---
  novoProduto: Omit<Product, 'companyId'> = {
    title: '',
    sellPrice: 0,
    buyPrice: 0,
    stock: 0,
    urlImage: '',
    color: '#f4c042', // Cor amarela padrão do Sistema
    soldByWeight: false // false = produto por unidade (comportamento atual)
  };

  // --- DADOS PARA COMPRA (ENTRADA) ---
  produtoSelecionadoCompra: Product | null = null;
  dadosCompra = {
    quantidade: 0,
    novoPrecoCusto: 0
  };

  // --- DESPESAS (substitui Contas a Pagar; competencia por dueDate, ver ExpenseReportService) ---
  despesas: Expense[] = [];
  categoriasDespesa: ExpenseCategory[] = [];
  isGastosModalOpen = false;

  // --- BUSCA NAS LISTAS (estado de UI; filtro puro em busca-por-nome.ts) ---
  buscaCliente = '';
  buscaProduto = '';

  get customersFiltrados(): Customer[] {
    return filtrarPorTermo(this.customers, this.buscaCliente, c => [c.name, c.phone]);
  }

  get productsFiltrados(): Product[] {
    return filtrarPorTermo(this.products, this.buscaProduto, p => [p.title]);
  }

  // --- CLIENTES ---
  customers: Customer[] = [];
  clienteEmEdicao: Customer | null = null;
  exibirFormularioCliente: boolean = false;
  novoCliente: Omit<Customer, 'id' | 'companyId'> = { name: '', phone: '', address: '', dataAniversario: '' };
  isDeleteClienteModalOpen: boolean = false;
  clienteToDelete: Customer | null = null;

  // --- HISTÓRICO DE PEDIDOS DO CLIENTE ---
  isHistoricoClienteOpen = false;
  clienteHistorico: Customer | null = null;
  pedidosCliente$: Observable<Order[]> = of([]);

  // --- VENDEDORES (CRUD + comissão) ---
  vendedores: Vendedor[] = [];
  orders: Order[] = []; // usado pelo cálculo de comissão da sub-aba Vendedores (Dashboard)
  /** Resultado calculado sob demanda (não getter de template) — ver atualizarComissoesVendedores(). */
  comissoesPorVendedorCalculadas: ComissaoVendedorResultado[] = [];
  vendedorEmEdicao: Vendedor | null = null;
  exibirFormularioVendedor: boolean = false;
  novoVendedor: Omit<Vendedor, 'id' | 'companyId'> = { name: '', comissoes: [] };
  isDeleteVendedorModalOpen: boolean = false;
  vendedorToDelete: Vendedor | null = null;
  /** Estado puro de UI (expand/collapse) — não é cálculo de domínio, só controla exibição da
   * lista de itens vendidos já pronta em `ComissaoVendedorResultado.itens`. */
  vendedoresItensExpandidos: Set<string> = new Set();

  // --- HISTÓRICO GERAL (aba própria em Gestão) ---
  historicoItems: HistoricoItem[] = [];
  historicoCarregando = true;
  filtroHistoricoOrigem: 'todos' | 'pdv' | 'pedido' | 'comanda' = 'todos';
  filtroHistoricoClienteId: string = '';
  filtroHistoricoProdutoId: string = '';
  filtroHistoricoBusca: string = '';
  filtroHistoricoFormaPagamento: PaymentMethod | 'todos' = 'todos';
  filtrosHistoricoVisiveis: boolean = false;
  /** Lançamento aberto no modal de detalhe — null = modal fechado. */
  detalheLancamentoAberto: HistoricoItem | null = null;

  // campos de endereço resolvidos via mini-mapa (lat/lng -> geocodificação reversa)
  clienteRua = '';
  clienteBairro = '';
  clienteCidade = '';
  clienteUf = '';
  clienteNumero = '';
  clienteComplemento = '';
  clienteLat?: number;
  clienteLng?: number;
  geocodeLoading = false;
  geocodeError = '';
  /** CEP não é mais digitado — vem do resultado da geocodificação reversa, best-effort. */
  private resolvedCep = '';

  get clienteFormattedAddress(): string {
    if (!this.clienteRua || !this.clienteNumero.trim() || !this.clienteBairro || !this.clienteCidade) return '';
    const num = this.clienteComplemento.trim()
      ? `${this.clienteNumero.trim()}, ${this.clienteComplemento.trim()}`
      : this.clienteNumero.trim();
    return `${this.clienteRua}, ${num}, ${this.clienteBairro}, ${this.clienteCidade} - ${this.clienteUf}`;
  }

  get clienteAddressReady(): boolean {
    return !!this.clienteRua && !!this.clienteNumero.trim() && !!this.clienteBairro && !!this.clienteCidade;
  }

  /** Rua/bairro/cidade vieram de algum lugar (geocodificação reversa ou registro
   * já salvo) — controla se os campos readonly de endereço aparecem no formulário.
   * Sem isso, um cliente sem endereço identificado (área rural, ponto sem
   * cadastro no provedor de mapas) mostrava os três campos vazios e acinzentados,
   * parecendo formulário quebrado em vez de "sem endereço, e tudo bem". */
  get clienteEnderecoDisponivel(): boolean {
    return !!this.clienteRua || !!this.clienteBairro || !!this.clienteCidade;
  }

  constructor(
    private productService: ProductService,
    private purchaseService: PurchaseService,
    private saleService: SaleService,
    private customerService: CustomerService,
    private expenseService: ExpenseService,
    private expenseCategoryService: ExpenseCategoryService,
    private expenseRecurrenceService: ExpenseRecurrenceService,
    private tenantService: TenantService,
    private orderService: OrderService,
    private comandaService: ComandaService,
    private vendedorService: VendedorService,
    private notif: NotificationService
  ) { }

  ngOnInit() {
    // 0. Se a aba/sub-aba ativa for de um módulo desativado, volta para o relatório
    this.config.modules$.subscribe(m => {
      if ((this.activeTab === 'clientes' && !m.clientes) ||
          (this.activeTab === 'vendedores' && !m.vendedores)) {
        this.selecionarAbaPrincipal('relatorio');
      }
      if (this.reportTab === 'vendedores' && !m.vendedores) {
        this.reportTab = 'vendas';
      }
    });

    // 1. Carrega produtos em tempo real
    this.productService.getProducts().subscribe(data => {
      this.products = data;
      this.isLoading = false;
      this.recalcularSeHaVendas(); // nomes/peso de produto entram no Top 5 e nos modais
    });

    // 2. Define datas iniciais como HOJE
    const hoje = new Date();
    this.filtroDataInicio = this.formatDateToInput(hoje);
    this.filtroDataFim = this.formatDateToInput(hoje);

    // 3. Calcula o relatório inicial
    this.atualizarRelatorio();

    // 4. Carrega clientes em tempo real
    this.customerService.getCustomers().subscribe(data => {
      this.customers = data;
      this.recalcularSeHaVendas(); // nome do cliente entra nos modais
    });

    // 5. Carrega despesas e categorias em tempo real
    this.expenseService.getExpenses().subscribe((data) => {
      this.despesas = data;
    });
    this.expenseCategoryService.getCategories().subscribe((data) => {
      this.categoriasDespesa = data;
    });
    this.gerarRecorrenciasAteHoje();

    // 7. Carrega e combina Histórico Geral (PDV + Pedidos + Comandas)
    combineLatest([
      this.saleService.getSales(),
      this.orderService.getOrders(),
      this.comandaService.getAllComandas()
    ]).subscribe(([vendas, pedidos, comandas]) => {
      this.historicoItems = this.montarHistorico(vendas, pedidos, comandas);
      this.historicoCarregando = false;
    });

    // 8. Carrega vendedores em tempo real
    this.vendedorService.getVendedores().subscribe(data => {
      this.vendedores = data;
    });

    // 9. Carrega pedidos em tempo real (usado no cálculo de comissão por vendedor)
    this.orderService.getOrders().subscribe(data => {
      this.orders = data;
      if (this.reportTab === 'receber') this.recalcularPanorama();
    });
  }

  // ==========================================================
  // ABA 5: HISTÓRICO GERAL
  // ==========================================================

  private montarHistorico(vendas: any[], pedidos: Order[], comandas: any[]): HistoricoItem[] {
    // PDV: só vendas de balcão (sale_type 'pdv'). Vendas com sale_type
    // 'order' não entram aqui pra não duplicar — o mesmo evento de negócio
    // já aparece como o Pedido correspondente (mais rico: nome do cliente,
    // endereço, ciclo de status), então a origem "pedido" cobre esse caso.
    const itensPdv: HistoricoItem[] = vendas
      .filter(v => v.sale_type === 'pdv')
      .map(v => {
        const itens = this.mapearItensHistorico(v.items);
        return {
          id: v.id!,
          origem: 'pdv' as const,
          data: this.dataDoPedido(v.date),
          clienteNome: 'Balcão (sem cliente)',
          clienteId: undefined,
          status: v.status || 'completed',
          total: v.total || 0,
          paymentMethod: v.paymentMethod,
          installments: v.installments,
          itens,
          itemsTotal: this.somaItensPorPrecoVenda(itens),
          shippingCost: 0 // PDV não tem frete
        };
      });

    const itensPedido: HistoricoItem[] = pedidos.map(p => {
      const itens = this.mapearItensHistorico(p.items);
      return {
        id: p.id!,
        numero: p.orderNumber,
        origem: 'pedido' as const,
        data: this.dataDoPedido(p.createdAt),
        clienteNome: p.customerName || 'Sem nome',
        clienteId: p.customerId,
        status: p.status,
        total: p.total || 0,
        paymentMethod: p.paymentMethod,
        installments: p.installments,
        itens,
        // p.itemsTotal é o valor gravado pelo OrderService; fallback pra soma
        // dos itens só cobre pedido antigo/inconsistente sem o campo.
        itemsTotal: p.itemsTotal ?? this.somaItensPorPrecoVenda(itens),
        shippingCost: p.shippingCost || 0,
        deliveryType: p.deliveryType,
        address: p.address,
        observations: p.observations
      };
    });

    // Comandas guardam o nome do cliente como texto livre, não vinculado a
    // um Customer.id — por isso não entram no filtro por cliente (mesma
    // limitação que já existe hoje pras vendas de PDV no Relatório).
    const itensComanda: HistoricoItem[] = comandas.map(c => {
      const itens = this.mapearItensHistorico(c.items);
      return {
        id: c.id!,
        origem: 'comanda' as const,
        data: this.dataDoPedido(c.createdAt),
        clienteNome: c.customerName || 'Sem nome',
        clienteId: undefined,
        status: c.status,
        total: c.total || 0,
        itens,
        itemsTotal: this.somaItensPorPrecoVenda(itens),
        shippingCost: 0 // Comanda não tem frete
      };
    });

    return [...itensPdv, ...itensPedido, ...itensComanda].sort((a, b) => {
      const ta = a.data ? a.data.getTime() : 0;
      const tb = b.data ? b.data.getTime() : 0;
      return tb - ta;
    });
  }

  // Normaliza os itens crus do snapshot (Sale/Order/Comanda) pro formato do
  // Histórico Geral, preservando priceAtSale/priceAtCost/soldByWeight — é o
  // que sustenta o cálculo de custo/lucro no modal de detalhe, sem precisar
  // buscar nada novo no Firestore.
  private mapearItensHistorico(itens: { idProduct: string; productName: string; quantity: number; priceAtSale: number; priceAtCost: number; soldByWeight?: boolean }[] | undefined): HistoricoItemProduto[] {
    return (itens || []).map(i => ({
      idProduct: i.idProduct,
      productName: i.productName,
      quantity: i.quantity,
      priceAtSale: i.priceAtSale || 0,
      priceAtCost: i.priceAtCost || 0,
      soldByWeight: i.soldByWeight
    }));
  }

  // Fallback de itemsTotal (pdv/comanda sempre usam este cálculo; pedido só
  // recorre a ele se Order.itemsTotal não estiver gravado). Reusa
  // subtotalItemHistorico pra não duplicar a regra de peso.
  private somaItensPorPrecoVenda(itens: HistoricoItemProduto[]): number {
    return itens.reduce((soma, i) => soma + this.subtotalItemHistorico(i), 0);
  }

  // ==========================================================
  // MODAL: DETALHE DO LANÇAMENTO (item do Histórico Geral)
  // ==========================================================

  abrirDetalheLancamento(item: HistoricoItem) {
    this.detalheLancamentoAberto = item;
  }

  fecharDetalheLancamento() {
    this.detalheLancamentoAberto = null;
  }

  // Custo dos produtos do lançamento — mesma fórmula do relatório
  // (soma priceAtCost * quantity), sobre o snapshot gravado nos itens.
  custoHistoricoItem(item: HistoricoItem): number {
    return item.itens.reduce((soma, i) => soma + i.priceAtCost * i.quantity, 0);
  }

  // Lucro = subtotal dos produtos - custo dos produtos. Frete é repasse,
  // não entra no lucro nem no custo.
  lucroHistoricoItem(item: HistoricoItem): number {
    return item.itemsTotal - this.custoHistoricoItem(item);
  }

  // Total em dinheiro de um item do lançamento — mesma regra de peso do PDV
  // (pdv.ts#totalLinha): delega a produto por kg pra calcularTotalItemPorPeso
  // (arredondamento seguro a centavos), senão priceAtSale * quantity direto.
  subtotalItemHistorico(i: HistoricoItemProduto): number {
    return i.soldByWeight
      ? calcularTotalItemPorPeso(i.priceAtSale, i.quantity)
      : i.priceAtSale * i.quantity;
  }

  get historicoFiltrado(): HistoricoItem[] {
    const busca = this.filtroHistoricoBusca.trim().toLowerCase();
    return this.historicoItems.filter(item => {
      if (this.filtroHistoricoOrigem !== 'todos' && item.origem !== this.filtroHistoricoOrigem) return false;
      if (this.filtroHistoricoClienteId && item.clienteId !== this.filtroHistoricoClienteId) return false;
      if (this.filtroHistoricoProdutoId && !item.itens.some(i => i.idProduct === this.filtroHistoricoProdutoId)) return false;
      if (this.filtroHistoricoFormaPagamento !== 'todos' && item.paymentMethod !== this.filtroHistoricoFormaPagamento) return false;
      if (busca) {
        const buscaNumero = busca.replace('#', '');
        const somenteNumero = /^\d+$/.test(buscaNumero);
        const bateNumero = item.numero !== undefined && item.numero.toString().includes(buscaNumero);
        // busca puramente numerica so compara com o numero do pedido — o
        // id interno do Firestore e uma string aleatoria que quase sempre
        // contem algum digito, entao comparar substring nele gera ruido.
        const bateId = !somenteNumero && item.id.toLowerCase().includes(busca);
        if (!bateId && !bateNumero) return false;
      }
      return true;
    });
  }

  limparFiltrosHistorico() {
    this.filtroHistoricoOrigem = 'todos';
    this.filtroHistoricoClienteId = '';
    this.filtroHistoricoProdutoId = '';
    this.filtroHistoricoBusca = '';
    this.filtroHistoricoFormaPagamento = 'todos';
  }

  origemLabel(origem: HistoricoItem['origem']): string {
    return { pdv: 'PDV', pedido: 'Pedido', comanda: 'Comanda' }[origem];
  }

  paymentMethodLabel(method: PaymentMethod | undefined): string {
    if (!method) return '';
    return PAYMENT_METHOD_LABELS[method] || '';
  }

  statusLabelHistorico(item: HistoricoItem): string {
    if (item.origem === 'pedido') return this.traduzirStatusPedido(item.status);
    if (item.origem === 'comanda') return item.status === 'open' ? 'Aberta' : 'Fechada';
    return item.status === 'canceled' ? 'Cancelada' : 'Concluída';
  }

  // Classe CSS do badge de status — com prefixo por origem pra "open" de
  // comanda não pegar a mesma cor de "open" de pedido (mesmo texto, coisas
  // diferentes). Pedido usa a classe crua porque já tem 8 status próprios
  // e nenhum colide com os de comanda/pdv.
  statusClassHistorico(item: HistoricoItem): string {
    if (item.origem === 'pedido') return item.status;
    return `${item.origem}-${item.status}`;
  }

  trackByHistorico(index: number, item: HistoricoItem): string {
    return item.id || index.toString();
  }

  // ==========================================================
  // GETTERS: DESPESAS (aba relatorio sub-tab)
  // ==========================================================

  /** Card Gastos = despesas operacionais com dueDate no periodo (competencia, D5). */
  get gastosPeriodo(): number {
    return ExpenseReportService.sumOperacionalPorVencimento(
      this.despesas,
      this.categoriasDespesa,
      this.filtroDataInicio,
      this.filtroDataFim,
    );
  }

  /** Informativo: custo de producao do periodo, ja incluso no CMV (D1). Nao entra no Resultado. */
  get custoProducaoPeriodo(): number {
    return ExpenseReportService.sumCustoProducaoPorVencimento(
      this.despesas,
      this.categoriasDespesa,
      this.filtroDataInicio,
      this.filtroDataFim,
    );
  }

  /** Breakdown por categoria operacional do periodo (modal Gastos), maior total primeiro. */
  get gastosPorCategoria(): CategoryBreakdownRow[] {
    return ExpenseReportService.breakdownPorCategoria(
      this.despesas,
      this.categoriasDespesa,
      this.filtroDataInicio,
      this.filtroDataFim,
      'despesa_operacional',
    );
  }

  /** Balanço olha só o período: faturamento e CMV vêm de relatorioBalanco, não dos filtros da aba Vendas. */
  get resultadoFinal(): number {
    return ExpenseReportService.calcResultado(
      this.relatorioBalanco.faturamento,
      this.relatorioBalanco.custoTotal,
      this.gastosPeriodo,
    );
  }

  /** Subtotal "= Lucro Bruto" da Composição do Resultado (faturamento - CMV do período). */
  get lucroBrutoBalanco(): number {
    return this.relatorioBalanco.lucro;
  }

  /** Margem líquida = Resultado Final / faturamento do período; 0 sem faturamento. */
  get margemLiquida(): number {
    const faturamento = this.relatorioBalanco.faturamento;
    return faturamento > 0 ? (this.resultadoFinal / faturamento) * 100 : 0;
  }

  /** Catch-up de recorrencias (D2): UMA chamada por carregamento; falha vira aviso, nao derruba a tela. */
  private async gerarRecorrenciasAteHoje(): Promise<void> {
    const companyId = this.tenantService.companyId();
    if (!companyId) {
      return;
    }
    try {
      await this.expenseRecurrenceService.generateDueOccurrences(
        companyId,
        ExpenseScheduleService.toDateKey(new Date()),
      );
    } catch {
      this.notif.warning('Não foi possível gerar as recorrências de despesas. ⚠️');
    }
  }

  abrirGastosModal() {
    this.isGastosModalOpen = true;
  }

  fecharGastosModal() {
    this.isGastosModalOpen = false;
  }

  openDeleteModal(product: Product) {
    this.productToDelete = product;
    this.isDeleteModalOpen = true;
  }

  closeDeleteModal() {
    this.isDeleteModalOpen = false;
    this.productToDelete = null;
  }

  async confirmDeleteProduct() {
    if (!this.productToDelete?.id) return;
    try {
      await this.productService.deleteProduct(this.productToDelete.id);
      this.notif.success('Produto removido! 🗑️');
      this.closeDeleteModal();
    } catch (error) {
      this.notif.error('Erro ao excluir produto. ❌');
    }
  }

  formatDateToInput(date: Date): string {
    const ano = date.getFullYear();
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }

  // ==========================================================
  // ABA 1: RELATÓRIO FINANCEIRO
  // ==========================================================
  /** Único lugar que monta o filtro de venda a partir dos filtro* atuais. */
  get filtroRelatorio(): FiltroRelatorio {
    return {
      inicio: new Date(this.filtroDataInicio + 'T00:00:00'),
      fim: new Date(this.filtroDataFim + 'T23:59:59'),
      produtoId: this.filtroProdutoId,
      origem: this.filtroOrigem,
      clienteId: this.filtroClienteId,
      formaPagamento: this.filtroFormaPagamento
    };
  }

  /** (Re)assina o Firestore para o período atual (cancelando a assinatura anterior) e recalcula. */
  atualizarRelatorio() {
    const { inicio, fim } = this.filtroRelatorio;

    this.vendasSub?.unsubscribe();
    this.vendasSub = this.saleService.getSalesByDate(inicio, fim).subscribe(vendas => {
      this.vendasBase = vendas;
      this.recalcularRelatorio();
    });

    // Atualiza o painel de comissões da sub-aba Vendedores (mesmo período filtrado).
    this.atualizarComissoesVendedores();
  }

  /** Filtra a base uma vez por escopo (Vendas e Balanço) e deriva cards, gráficos e modal aberto. */
  private recalcularRelatorio() {
    const filtro = this.filtroRelatorio;
    this.vendasFiltradas = filtrarVendas(this.vendasBase, filtro);
    this.relatorio = calcularCards(this.vendasFiltradas);
    this.vendasBalanco = filtrarVendas(this.vendasBase, filtroSomentePeriodo(filtro));
    this.relatorioBalanco = calcularCards(this.vendasBalanco);
    this.ranking = rankingTopQuantidade(this.vendasFiltradas, this.produtosPorId());

    this.agendarGraficosVendas();
    if (this.detalheAberto) this.recalcularDetalhe();
  }

  /** Produtos/clientes chegam depois das vendas; só reprocessa se já houver base. */
  private recalcularSeHaVendas() {
    if (this.vendasBase.length > 0) this.recalcularRelatorio();
  }

  private produtosPorId(): ProdutosPorId {
    return new Map(this.products.filter(p => !!p.id).map(p => [p.id!, p]));
  }

  private nomesClientes(): NomesClientes {
    return new Map(this.customers.filter(c => !!c.id).map(c => [c.id!, c.name]));
  }

  ngOnDestroy() {
    this.vendasSub?.unsubscribe();
    this.vendasSub = null;
    this.destruirGraficosVendas();
    this.destruirGraficosDetalhe();
    this.receberChart?.destroy();
    this.receberChart = null;
  }

  // ==========================================================
  // SUB-ABA A RECEBER (panorama anual)
  // ==========================================================

  /** Troca a sub-aba do relatório; o gráfico do panorama é destruído ao sair e recriado ao entrar. */
  selecionarReportTab(tab: ProductInventoryComponent['reportTab']) {
    this.reportTab = tab;
    this.fecharMesDetalhe();
    this.fecharDetalhe();
    this.destruirGraficosVendas(); // o canvas some pelo *ngIf; ao voltar para Vendas é redesenhado
    if (tab === 'vendas') this.agendarGraficosVendas();
    if (tab === 'receber') {
      this.atualizarPanorama();
    } else {
      this.receberChart?.destroy();
      this.receberChart = null;
    }
  }

  /** Troca a aba principal; ao sair do Relatório destrói o gráfico (o canvas some pelo *ngIf) e ao voltar redesenha o panorama. */
  selecionarAbaPrincipal(tab: ProductInventoryComponent['activeTab']) {
    if (this.activeTab === 'relatorio' && tab !== 'relatorio') {
      this.receberChart?.destroy();
      this.receberChart = null;
      this.fecharMesDetalhe();
      this.fecharDetalhe();
      this.destruirGraficosVendas();
    }
    this.activeTab = tab;
    if (tab === 'relatorio' && this.reportTab === 'receber') {
      this.recalcularPanorama();
    }
    if (tab === 'relatorio' && this.reportTab === 'vendas') {
      this.agendarGraficosVendas();
    }
  }

  /** Navegação (troca de ano): recalcula o panorama e fecha o modal do mês. */
  atualizarPanorama() {
    this.fecharMesDetalhe();
    this.recalcularPanorama();
  }

  /** Dado novo ou navegação: recalcula panorama e gráfico; se o modal do mês está aberto, atualiza a lista sem fechá-lo. */
  private recalcularPanorama() {
    const hoje = new Date();
    this.panorama = montarPanoramaAnual(this.orders, this.anoPanorama, hoje);
    if (this.mesDetalheAberto !== null) {
      this.movimentosMesDetalhe = listarMovimentoDoMes(this.orders, this.anoPanorama, this.mesDetalheAberto, hoje);
    }
    setTimeout(() => this.renderReceberChart());
  }

  private lerToken(nome: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  }

  renderReceberChart() {
    const ctx = document.getElementById('receberChart') as HTMLCanvasElement | null;
    this.receberChart?.destroy();
    this.receberChart = null;
    if (!ctx || !this.panorama || this.reportTab !== 'receber') return;

    const meses = this.panorama.meses;
    const textoMudo = this.lerToken('--text-muted');
    const textoPrincipal = this.lerToken('--text-primary');
    const corGrade = this.lerToken('--border-color');

    this.receberChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: this.mesesAbreviados,
        datasets: [
          { label: 'Recebido', data: meses.map(m => m.recebido), backgroundColor: this.lerToken('--color-success'), borderRadius: 4 },
          { label: 'Previsto', data: meses.map(m => m.previsto), backgroundColor: this.lerToken('--color-info'), borderRadius: 4 },
          { label: 'Vencido', data: meses.map(m => m.vencido), backgroundColor: this.lerToken('--color-danger'), borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evento, _elementos, chart) => {
          const alvos = chart.getElementsAtEventForMode(evento as unknown as Event, 'index', { intersect: false }, true);
          if (alvos.length) this.abrirMesDetalhe(alvos[0].index);
        },
        plugins: { legend: { display: true, labels: { color: textoPrincipal } } },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: textoMudo } },
          y: { stacked: true, beginAtZero: true, grid: { color: corGrade }, ticks: { color: textoMudo } }
        }
      }
    });
  }

  abrirMesDetalhe(mes: number) {
    this.mesDetalheAberto = mes;
    this.movimentosMesDetalhe = listarMovimentoDoMes(this.orders, this.anoPanorama, mes, new Date());
  }

  fecharMesDetalhe() {
    this.mesDetalheAberto = null;
    this.movimentosMesDetalhe = [];
  }

  tipoMovimentoLabel(tipo: MovimentoMes['tipo']): string {
    return { recebido: 'Recebido', previsto: 'Previsto', vencido: 'Vencido' }[tipo];
  }

  // --- PRESETS DE DATA ---
  setPreset(preset: 'hoje' | '7dias' | 'mes' | 'mesAnterior') {
    const hoje = new Date();
    let inicio = new Date();
    let fim = new Date();

    switch (preset) {
      case 'hoje':
        // Já está setado como hoje
        break;
      case '7dias':
        inicio.setDate(hoje.getDate() - 7);
        break;
      case 'mes':
        inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        break;
      case 'mesAnterior':
        inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
        fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
        break;
    }

    this.filtroDataInicio = this.formatDateToInput(inicio);
    this.filtroDataFim = this.formatDateToInput(fim);
    this.atualizarRelatorio();
  }

  // --- LÓGICA DE GRÁFICOS ---
  // Todos derivam de vendasFiltradas / ranking (nenhum filtro de venda mora aqui).

  /** Canvas dentro de *ngIf só existe após o render: cria os gráficos num tick seguinte. */
  private agendarGraficosVendas() {
    setTimeout(() => this.renderCharts());
  }

  renderCharts() {
    this.renderSalesHistoryChart();
    this.renderTopProductsChart();
  }

  private destruirGraficosVendas() {
    this.salesChart?.destroy();
    this.salesChart = null;
    this.topProductsChart?.destroy();
    this.topProductsChart = null;
  }

  /** 'yyyy-MM-dd' -> 'dd/MM' (só apresentação; a chave vem de serieDiaria). */
  private rotuloDia(dia: string): string {
    return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
  }

  private formatarMoeda(valor: number): string {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  renderSalesHistoryChart() {
    this.salesChart?.destroy();
    this.salesChart = null;
    const ctx = document.getElementById('salesChart') as HTMLCanvasElement | null;
    if (!ctx) return;

    const { inicio, fim } = this.filtroRelatorio;
    const serie = serieDiaria(this.vendasFiltradas, inicio, fim);

    this.salesChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: serie.map(p => this.rotuloDia(p.dia)),
        datasets: [{
          label: 'Vendas (R$)',
          data: serie.map(p => p.valor),
          borderColor: '#f4c042',
          backgroundColor: 'rgba(244, 192, 66, 0.1)',
          fill: true,
          tension: 0.4,
          borderWidth: 3,
          pointBackgroundColor: '#f4c042'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#888' }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#888' }
          }
        }
      }
    });
  }

  // --- TOP 5 PRODUTOS (unidade x kg) ---

  get topModoEfetivo(): ModoTop {
    return modoTopEfetivo(this.ranking, this.topModo);
  }

  get topTemAmbos(): boolean {
    return this.ranking.unidade.length > 0 && this.ranking.peso.length > 0;
  }

  get topSemDados(): boolean {
    return this.ranking.unidade.length === 0 && this.ranking.peso.length === 0;
  }

  definirTopModo(modo: ModoTop) {
    this.topModo = modo;
    this.renderTopProductsChart();
  }

  renderTopProductsChart() {
    this.topProductsChart?.destroy();
    this.topProductsChart = null;
    const ctx = document.getElementById('topProductsChart') as HTMLCanvasElement | null;
    if (!ctx) return;

    const modo = this.topModoEfetivo;
    const itens = this.ranking[modo];
    if (itens.length === 0) return;

    const casas = modo === 'peso' ? 3 : 0;
    const sufixo = modo === 'peso' ? 'kg' : 'un';
    const formatar = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });

    this.topProductsChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: itens.map(i => i.nome),
        datasets: [{
          label: `Qtd Vendida (${sufixo})`,
          data: itens.map(i => i.quantidade),
          backgroundColor: [
            '#f4c042', '#3498db', '#2ecc71', '#e74c3c', '#9b59b6'
          ],
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: c => `${formatar(Number(c.parsed.x))} ${sufixo}` }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#888', precision: casas, callback: v => formatar(Number(v)) }
          },
          y: {
            grid: { display: false },
            ticks: { color: '#fff' }
          }
        }
      }
    });
  }

  // ==========================================================
  // MODAIS DE DETALHE: Faturamento / CMV / Lucro Bruto
  // ==========================================================

  abrirDetalhe(tipo: DetalheRelatorio, escopo: EscopoDetalhe) {
    this.detalheAberto = tipo;
    this.detalheEscopo = escopo;
    this.recalcularDetalhe();
  }

  fecharDetalhe() {
    this.detalheAberto = null;
    this.detalheFaturamento = null;
    this.linhasCmv = [];
    this.linhasLucro = [];
    this.cmvLinhasSemCusto = 0;
    this.destruirGraficosDetalhe();
  }

  get detalheTitulo(): string {
    return this.detalheAberto ? TITULO_DETALHE[this.detalheAberto] : '';
  }

  /** Cards do escopo aberto — o rodapé do modal tem que bater com o card clicado. */
  private get cardsDoEscopo(): CardsRelatorio {
    return this.detalheEscopo === 'balanco' ? this.relatorioBalanco : this.relatorio;
  }

  get detalheTotal(): number {
    const cards = this.cardsDoEscopo;
    switch (this.detalheAberto) {
      case 'faturamento': return cards.faturamento;
      case 'cmv': return cards.custoTotal;
      case 'lucro': return cards.lucro;
      default: return 0;
    }
  }

  get faturamentoGeral(): Extract<DetalheFaturamento, { modo: 'geral' }> | null {
    return this.detalheFaturamento?.modo === 'geral' ? this.detalheFaturamento : null;
  }

  get faturamentoPorProduto(): Extract<DetalheFaturamento, { modo: 'produto' }> | null {
    return this.detalheFaturamento?.modo === 'produto' ? this.detalheFaturamento : null;
  }

  origemVendaLabel(origem: OrigemVenda): string {
    return origem === 'pdv' ? 'PDV' : 'Pedido';
  }

  /** Recalcula o conteúdo do modal aberto a partir das vendas do escopo (nunca de outra fonte). */
  private recalcularDetalhe() {
    const tipo = this.detalheAberto;
    if (!tipo) return;

    const balanco = this.detalheEscopo === 'balanco';
    const vendas = balanco ? this.vendasBalanco : this.vendasFiltradas;
    const filtro = balanco ? filtroSomentePeriodo(this.filtroRelatorio) : this.filtroRelatorio;
    const produtos = this.produtosPorId();

    if (tipo === 'faturamento') {
      this.detalheFaturamento = montarDetalheFaturamento(vendas, filtro, produtos, this.nomesClientes());
      this.coresPizza = this.detalheFaturamento.modo === 'geral'
        ? this.coresDasFatias(this.detalheFaturamento.pizza)
        : [];
    } else if (tipo === 'cmv') {
      this.linhasCmv = montarDetalheCmv(vendas, produtos);
      this.cmvLinhasSemCusto = this.linhasCmv.filter(l => l.custoZero).length;
    } else {
      this.linhasLucro = montarDetalheLucro(vendas, produtos);
    }

    this.montarCabecalhoDetalhe(balanco);
    setTimeout(() => this.renderGraficosDetalhe());
  }

  /** Período + filtros ativos do escopo (Balanço só tem período). */
  private montarCabecalhoDetalhe(balanco: boolean) {
    this.detalhePeriodo = `${this.formatarDataInput(this.filtroDataInicio)} a ${this.formatarDataInput(this.filtroDataFim)}`;
    const ativos: string[] = [];
    if (!balanco) {
      if (this.filtroProdutoId) {
        ativos.push(`Produto: ${this.products.find(p => p.id === this.filtroProdutoId)?.title ?? 'não encontrado'}`);
      }
      if (this.filtroOrigem !== 'todos') ativos.push(`Origem: ${this.origemVendaLabel(this.filtroOrigem)}`);
      if (this.filtroClienteId) {
        ativos.push(`Cliente: ${this.customers.find(c => c.id === this.filtroClienteId)?.name ?? 'não encontrado'}`);
      }
      if (this.filtroFormaPagamento !== 'todos') {
        ativos.push(`Pagamento: ${PAYMENT_METHOD_LABELS[this.filtroFormaPagamento]}`);
      }
    }
    this.detalheFiltrosAtivos = ativos;
  }

  /** 'yyyy-MM-dd' (valor do input date) -> 'dd/MM/yyyy'. */
  private formatarDataInput(valor: string): string {
    const [ano, mes, dia] = valor.split('-');
    return dia && mes && ano ? `${dia}/${mes}/${ano}` : valor;
  }

  private coresDasFatias(fatias: FatiaProduto[]): string[] {
    const paleta = TOKENS_PALETA.map(t => this.lerToken(t));
    const outros = this.lerToken('--text-muted');
    return fatias.map((f, i) => (f.idProduct === null ? outros : paleta[i % paleta.length]));
  }

  private destruirGraficosDetalhe() {
    this.faturamentoPizzaChart?.destroy();
    this.faturamentoPizzaChart = null;
    this.faturamentoDiaChart?.destroy();
    this.faturamentoDiaChart = null;
  }

  /** Canvas do modal vive em *ngIf: recria os gráficos a cada recálculo, destrói ao fechar. */
  private renderGraficosDetalhe() {
    this.destruirGraficosDetalhe();
    if (this.detalheAberto !== 'faturamento') return;

    const textoMudo = this.lerToken('--text-muted');
    const corGrade = this.lerToken('--border-color');
    const geral = this.faturamentoGeral;
    const porProduto = this.faturamentoPorProduto;

    const ctxPizza = document.getElementById('faturamentoPizzaChart') as HTMLCanvasElement | null;
    if (geral && ctxPizza && geral.pizza.length > 0) {
      this.faturamentoPizzaChart = new Chart(ctxPizza, {
        type: 'pie',
        data: {
          labels: geral.pizza.map(f => f.nome),
          datasets: [{
            data: geral.pizza.map(f => f.valor),
            backgroundColor: this.coresPizza,
            borderColor: this.lerToken('--bg-card')
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: c => `${c.label}: ${this.formatarMoeda(Number(c.parsed))}` } }
          }
        }
      });
    }

    const ctxDia = document.getElementById('faturamentoDiaChart') as HTMLCanvasElement | null;
    if (porProduto && ctxDia && porProduto.porDia.length > 0) {
      this.faturamentoDiaChart = new Chart(ctxDia, {
        type: 'bar',
        data: {
          labels: porProduto.porDia.map(d => this.rotuloDia(d.dia)),
          datasets: [{
            label: 'Faturamento (R$)',
            data: porProduto.porDia.map(d => d.valor),
            backgroundColor: this.lerToken('--color-primary'),
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: c => this.formatarMoeda(Number(c.parsed.y)) } }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: textoMudo } },
            y: { beginAtZero: true, grid: { color: corGrade }, ticks: { color: textoMudo } }
          }
        }
      });
    }
  }

  limparFiltros() {
    const hoje = new Date();
    this.filtroDataInicio = this.formatDateToInput(hoje);
    this.filtroDataFim = this.formatDateToInput(hoje);
    this.filtroProdutoId = '';
    this.filtroOrigem = 'todos';
    this.filtroClienteId = '';
    this.filtroFormaPagamento = 'todos';
    this.atualizarRelatorio();
  }

  // ==========================================================
  // ABA 2: ESTOQUE (CADASTRO COM COR E IMAGEM)
  // ==========================================================

  abrirNovo() {
    this.produtoEmEdicao = null;
    this.novoProduto = {
      title: '',
      sellPrice: 0,
      buyPrice: 0,
      stock: 0,
      urlImage: '',
      color: '#f4c042',
      soldByWeight: false
    };
    this.exibirFormularioNovo = true;
    this.produtoSelecionadoCompra = null;
  }

  abrirEdicao(p: Product) {
    this.produtoEmEdicao = p;
    // Garante que campos opcionais tenham valor padrão ao editar
    this.novoProduto = {
      ...p,
      urlImage: p.urlImage || '',
      color: p.color || '#f4c042',
      soldByWeight: !!p.soldByWeight // produto legado sem o campo => por unidade
    };
    this.exibirFormularioNovo = true;
    this.produtoSelecionadoCompra = null;
  }

  fecharFormulario() {
    this.exibirFormularioNovo = false;
    this.produtoEmEdicao = null;
  }

  async salvarProduto() {
    if (!this.novoProduto.title || this.novoProduto.sellPrice <= 0) {
      this.notif.warning('Preencha os campos obrigatórios! ⚠️');
      return;
    }

    // Firestore rejeita undefined — normaliza a boolean de "vendido por peso".
    const payload: Omit<Product, 'companyId'> = {
      ...this.novoProduto,
      soldByWeight: !!this.novoProduto.soldByWeight
    };

    try {
      if (this.produtoEmEdicao) {
        await this.productService.updateProduct(this.produtoEmEdicao.id!, payload);
        this.notif.success('Produto atualizado com sucesso! ✅');
      } else {
        await this.productService.addProduct(payload);
        this.notif.success('Produto cadastrado com sucesso! ✨');
      }
      this.fecharFormulario();
    } catch (error) {
      this.notif.error('Erro ao salvar produto. ❌');
    }
  }

  excluirProduto(product: Product) {
    this.openDeleteModal(product);
  }

  selecionarParaCompra(p: Product) {
    this.produtoSelecionadoCompra = p;
    this.dadosCompra = {
      quantidade: 0,
      novoPrecoCusto: p.buyPrice || 0
    };
    this.exibirFormularioNovo = false;
  }

  async confirmarCompra() {
    if (!this.produtoSelecionadoCompra || this.dadosCompra.quantidade <= 0) {
      this.notif.warning('Informe uma quantidade válida! ⚠️');
      return;
    }

    try {
      await this.purchaseService.addPurchase({
        idProduct: this.produtoSelecionadoCompra.id!,
        amount: this.dadosCompra.quantidade,
        unityValue: this.dadosCompra.novoPrecoCusto,
        date: new Date()
      } as any);

      this.notif.success(`Estoque de "${this.produtoSelecionadoCompra.title}" atualizado! 💰`);
      this.produtoSelecionadoCompra = null;
    } catch (error) {
      this.notif.error('Erro ao registrar entrada. ❌');
    }
  }

  cancelarSelecaoCompra() {
    this.produtoSelecionadoCompra = null;
  }

  // ==========================================================
  // ABA 3: CLIENTES
  // ==========================================================

  abrirNovoCliente() {
    this.clienteEmEdicao = null;
    this.novoCliente = { name: '', phone: '', address: '', dataAniversario: '' };
    this.clienteRua = '';
    this.clienteBairro = '';
    this.clienteCidade = '';
    this.clienteUf = '';
    this.clienteNumero = '';
    this.clienteComplemento = '';
    this.clienteLat = undefined;
    this.clienteLng = undefined;
    this.resolvedCep = '';
    this.geocodeError = '';
    this.exibirFormularioCliente = true;
  }

  abrirEdicaoCliente(c: Customer) {
    this.clienteEmEdicao = c;
    this.novoCliente     = {
      name: c.name,
      phone: c.phone || '',
      address: c.address || '',
      dataAniversario: c.dataAniversario || ''
    };
    this.clienteRua          = c.rua         ?? c.address ?? '';
    this.clienteNumero       = c.numero      ?? '';
    this.clienteComplemento  = c.complemento ?? '';
    this.clienteBairro       = c.bairro      ?? '';
    this.clienteCidade       = c.cidade      ?? '';
    this.clienteUf           = c.uf          ?? '';
    this.clienteLat          = c.lat;
    this.clienteLng          = c.lng;
    this.resolvedCep         = c.cep ?? '';
    this.geocodeError        = '';
    this.exibirFormularioCliente = true;
  }

  fecharFormularioCliente() {
    this.exibirFormularioCliente = false;
    this.clienteEmEdicao = null;
  }

  async onClientePositionChange({ lat, lng }: { lat: number; lng: number }) {
    this.clienteLat = lat;
    this.clienteLng = lng;
    this.geocodeLoading = true;
    this.geocodeError = '';
    try {
      const result = await this.geocodingService.reverseGeocode(lat, lng);
      if (result) {
        this.clienteRua    = result.rua    ?? '';
        this.clienteBairro = result.bairro ?? '';
        this.clienteCidade = result.cidade ?? '';
        this.clienteUf     = result.uf     ?? '';
        this.resolvedCep   = result.cep    ?? '';
        if (result.numero) {
          this.clienteNumero = result.numero;
        }
      } else {
        this.clienteRua    = '';
        this.clienteBairro = '';
        this.clienteCidade = '';
        this.clienteUf     = '';
        this.resolvedCep   = '';
        this.geocodeError = 'Não foi possível identificar o endereço desta posição. '
          + 'Você pode salvar assim mesmo — a localização será usada para calcular a rota de entrega.';
      }
    } finally {
      this.geocodeLoading = false;
    }
  }

  async salvarCliente() {
    if (!this.novoCliente.name?.trim()) {
      this.notif.warning('O nome do cliente é obrigatório!');
      return;
    }
    const address = this.clienteFormattedAddress || this.novoCliente.address || '';
    const data: Omit<Customer, 'id' | 'companyId'> = {
      name:        this.novoCliente.name.trim(),
      phone:       this.novoCliente.phone?.trim() || '',
      address,
      dataAniversario: this.novoCliente.dataAniversario || '',
      cep:         this.resolvedCep,
      rua:         this.clienteRua,
      numero:      this.clienteNumero,
      complemento: this.clienteComplemento,
      bairro:      this.clienteBairro,
      cidade:      this.clienteCidade,
      uf:          this.clienteUf,
      ...(this.clienteLat != null ? { lat: this.clienteLat } : {}),
      ...(this.clienteLng != null ? { lng: this.clienteLng } : {})
    };
    try {
      if (this.clienteEmEdicao?.id) {
        await this.customerService.updateCustomer(this.clienteEmEdicao.id, data);
        this.notif.success('Cliente atualizado!');
      } else {
        await this.customerService.addCustomer(data);
        this.notif.success('Cliente cadastrado!');
      }
      this.fecharFormularioCliente();
    } catch {
      this.notif.error('Erro ao salvar cliente.');
    }
  }

  openDeleteClienteModal(c: Customer) {
    this.clienteToDelete = c;
    this.isDeleteClienteModalOpen = true;
  }

  closeDeleteClienteModal() {
    this.isDeleteClienteModalOpen = false;
    this.clienteToDelete = null;
  }

  async confirmDeleteCliente() {
    if (!this.clienteToDelete?.id) return;
    try {
      await this.customerService.deleteCustomer(this.clienteToDelete.id);
      this.notif.success('Cliente removido!');
      this.closeDeleteClienteModal();
    } catch {
      this.notif.error('Erro ao excluir cliente.');
    }
  }

  // --- HISTÓRICO DE PEDIDOS DO CLIENTE ---

  abrirHistoricoCliente(c: Customer) {
    this.clienteHistorico = c;
    this.pedidosCliente$ = this.orderService.getOrdersByCustomer(c.id!);
    this.isHistoricoClienteOpen = true;
  }

  fecharHistoricoCliente() {
    this.isHistoricoClienteOpen = false;
    this.clienteHistorico = null;
    this.pedidosCliente$ = of([]);
  }

  traduzirStatusPedido(status: string): string {
    const map: Record<string, string> = {
      open: 'Aberto', pending: 'Pendente', preparing: 'Preparando',
      ready: 'Pronto', delivering: 'Em Entrega', delivered: 'Entregue',
      finished: 'Finalizado', canceled: 'Cancelado'
    };
    return map[status] || status;
  }

  // Aceita undefined porque HistoricoItem.deliveryType é opcional (só existe
  // pra origem 'pedido') — sem non-null assertion no call site.
  tipoEntregaLabel(tipo: 'pickup' | 'delivery' | undefined): string {
    return tipo === 'delivery' ? 'Entrega' : 'Retirada';
  }

  dataDoPedido(date: any): Date | null {
    if (!date) return null;
    if (typeof date.toDate === 'function') return date.toDate();
    return new Date(date);
  }

  trackByPedido(index: number, pedido: Order): string {
    return pedido.id || index.toString();
  }

  // ==========================================================
  // ABA VENDEDORES (cadastro + sub-aba de comissão no relatório)
  // ==========================================================

  abrirNovoVendedor() {
    this.vendedorEmEdicao = null;
    this.novoVendedor = { name: '', comissoes: [] };
    this.exibirFormularioVendedor = true;
  }

  abrirEdicaoVendedor(v: Vendedor) {
    this.vendedorEmEdicao = v;
    this.novoVendedor = { name: v.name, comissoes: v.comissoes.map(c => ({ ...c })) };
    this.exibirFormularioVendedor = true;
  }

  fecharFormularioVendedor() {
    this.exibirFormularioVendedor = false;
    this.vendedorEmEdicao = null;
  }

  /** Percentual cadastrado para um produto no vendedor em edição — 0 se ausente da lista. */
  getPercentualProduto(idProduct: string): number {
    const item = this.novoVendedor.comissoes.find(c => c.idProduct === idProduct);
    return item ? item.percentual : 0;
  }

  /** Grava/remove o percentual de um produto no formulário de vendedor em edição. */
  setPercentualProduto(idProduct: string, value: number | string) {
    const percentual = Math.min(100, Math.max(0, Number(value) || 0));
    const idx = this.novoVendedor.comissoes.findIndex(c => c.idProduct === idProduct);
    if (percentual === 0) {
      if (idx > -1) this.novoVendedor.comissoes.splice(idx, 1);
    } else if (idx > -1) {
      this.novoVendedor.comissoes[idx].percentual = percentual;
    } else {
      this.novoVendedor.comissoes.push({ idProduct, percentual });
    }
  }

  async salvarVendedor() {
    if (!this.novoVendedor.name?.trim()) {
      this.notif.warning('O nome do vendedor é obrigatório! ⚠️');
      return;
    }
    const data: Omit<Vendedor, 'id' | 'companyId'> = {
      name: this.novoVendedor.name.trim(),
      comissoes: this.novoVendedor.comissoes
    };
    try {
      if (this.vendedorEmEdicao?.id) {
        await this.vendedorService.updateVendedor(this.vendedorEmEdicao.id, data);
        this.notif.success('Vendedor atualizado! ✅');
      } else {
        await this.vendedorService.addVendedor(data);
        this.notif.success('Vendedor cadastrado! ✨');
      }
      this.fecharFormularioVendedor();
    } catch {
      this.notif.error('Erro ao salvar vendedor. ❌');
    }
  }

  openDeleteVendedorModal(v: Vendedor) {
    this.vendedorToDelete = v;
    this.isDeleteVendedorModalOpen = true;
  }

  closeDeleteVendedorModal() {
    this.isDeleteVendedorModalOpen = false;
    this.vendedorToDelete = null;
  }

  async confirmDeleteVendedor() {
    if (!this.vendedorToDelete?.id) return;
    try {
      await this.vendedorService.deleteVendedor(this.vendedorToDelete.id);
      this.notif.success('Vendedor removido! 🗑️');
      this.closeDeleteVendedorModal();
    } catch {
      this.notif.error('Erro ao excluir vendedor. ❌');
    }
  }

  /** Pedidos finalizados (status 'finished') cujo fechamento caiu dentro do período filtrado — mesmo par de datas usado nas outras sub-abas do relatório. Helper interno, não mais getter de template (evita recálculo a cada ciclo de change detection). */
  private pedidosFinalizadosNoPeriodo(): Order[] {
    const inicio = new Date(this.filtroDataInicio + 'T00:00:00');
    const fim = new Date(this.filtroDataFim + 'T23:59:59');
    return this.orders
      .filter(o => o.status === 'finished' && o.closingDate)
      .filter(o => {
        const d = (o.closingDate as any)?.toDate ? (o.closingDate as any).toDate() : new Date(o.closingDate as any);
        return d >= inicio && d <= fim;
      });
  }

  /**
   * Recalcula o total vendido/comissão a pagar por vendedor no período filtrado e guarda em
   * `comissoesPorVendedorCalculadas` — calculado sob demanda (entrada na sub-aba, mudança de
   * filtro de data), nunca como getter ligado direto no template. Delega o cálculo ao método
   * estático já testado do VendedorService.
   */
  atualizarComissoesVendedores() {
    const pedidos = this.pedidosFinalizadosNoPeriodo();
    this.comissoesPorVendedorCalculadas = this.vendedores.map(v =>
      VendedorService.calculateComissaoVendedor(pedidos, v)
    );
  }

  /** Alterna a exibição da lista de produtos vendidos de um vendedor no card de comissão. */
  alternarItensVendedor(vendedorId: string) {
    if (this.vendedoresItensExpandidos.has(vendedorId)) {
      this.vendedoresItensExpandidos.delete(vendedorId);
    } else {
      this.vendedoresItensExpandidos.add(vendedorId);
    }
  }

  vendedorItensExpandido(vendedorId: string): boolean {
    return this.vendedoresItensExpandidos.has(vendedorId);
  }

  // No seu ProductInventoryComponent

  onFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      const reader = new FileReader();

      // Quando terminar de ler o arquivo
      reader.onload = (e: any) => {
        const base64String = e.target.result;
        // Salvamos a imagem inteira como string no campo urlImage
        this.novoProduto.urlImage = base64String;
      };

      reader.readAsDataURL(file); // Converte para Base64
    }
  }
}