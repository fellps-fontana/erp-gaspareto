import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { Observable, of, combineLatest } from 'rxjs';

Chart.register(...registerables);

// Models e Services
import { Product } from '../../models/product-model';
import { Customer } from '../../models/customer-model';
import { Bill } from '../../models/bill-model';
import { PurchaseProduct } from '../../models/purchase-product-model';
import { Order } from '../../models/order-model';
import { PaymentMethod, PAYMENT_METHOD_LABELS } from '../../models/sell-model';
import { ProductService } from '../../services/product-service/product-service';
import { SaleService } from '../../services/sale-service/sale-service';
import { PurchaseService } from '../../services/purchase-service/purchase-service';
import { CustomerService } from '../../services/customer-service/customer-service';
import { BillService } from '../../services/bill-service/bill-service';
import { PurchaseProductService } from '../../services/purchase-product-service/purchase-product-service';
import { NotificationService } from '../../services/notification-service/notification.service';
import { ConfigService } from '../../services/config/config.service';
import { OrderService } from '../../services/order-service/order-service';
import { ComandaService } from '../../services/comanda-service/comanda-service';
import { GeocodingService } from '../../services/geocoding-service/geocoding-service';
import { MapPickerComponent } from '../map-picker/map-picker';

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
  itens: { idProduct: string; productName: string; quantity: number }[];
}

@Component({
  selector: 'app-estoque',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MapPickerComponent],
  templateUrl: './product-inventory.html',
  styleUrls: ['./product-inventory.css', './product-inventory-mobile.css']
})
export class ProductInventoryComponent implements OnInit {
  readonly config = inject(ConfigService);
  private geocodingService = inject(GeocodingService);

  // Controle das Abas
  activeTab: 'relatorio' | 'estoque' | 'clientes' | 'compras' | 'historico' = 'relatorio';
  reportTab: 'vendas' | 'contas' | 'balanco' = 'vendas';

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
  filtroOrigem: string = 'todos'; // 'todos' | 'pdv' | 'order'
  filtroClienteId: string = '';
  filtroFormaPagamento: PaymentMethod | 'todos' = 'todos';
  filtrosRelatorioVisiveis: boolean = false;

  // --- MODAL DE EXCLUSÃO DE PRODUTO ---
  isDeleteModalOpen: boolean = false;
  productToDelete: Product | null = null;

  // --- DADOS DO RELATÓRIO ---
  relatorio = {
    faturamento: 0,
    custoTotal: 0,
    lucro: 0,
    qtdVendas: 0,
    margem: 0
  };

  // --- CHART INSTANCES ---
  salesChart: any;
  topProductsChart: any;

  // --- DADOS PARA CADASTRO / EDIÇÃO (CAMPOS NOVOS ADICIONADOS) ---
  novoProduto: Omit<Product, 'companyId'> = {
    title: '',
    sellPrice: 0,
    buyPrice: 0,
    stock: 0,
    urlImage: '',
    color: '#f4c042' // Cor amarela padrão do Sistema
  };

  // --- DADOS PARA COMPRA (ENTRADA) ---
  produtoSelecionadoCompra: Product | null = null;
  dadosCompra = {
    quantidade: 0,
    novoPrecoCusto: 0
  };
  gerarContaPagar: boolean = false;
  nomeConta: string = '';

  // --- CONTAS A PAGAR ---
  bills: Bill[] = [];
  filtroContasStatus: 'todos' | 'pendente' | 'recebido' | 'pago' = 'todos';

  // --- PRODUTOS DE COMPRA ---
  purchaseProducts: PurchaseProduct[] = [];
  exibirFormularioCompra: boolean = false;
  produtoCompraEmEdicao: PurchaseProduct | null = null;
  isDeleteCompraModalOpen: boolean = false;
  produtoCompraToDelete: PurchaseProduct | null = null;
  novoProdutoCompra: Omit<PurchaseProduct, 'id' | 'createdAt' | 'companyId'> = {
    name: '',
    defaultValue: 0,
    recurring: false,
    recurrencePeriod: undefined
  };

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

  // --- HISTÓRICO GERAL (aba própria em Gestão) ---
  historicoItems: HistoricoItem[] = [];
  historicoCarregando = true;
  filtroHistoricoOrigem: 'todos' | 'pdv' | 'pedido' | 'comanda' = 'todos';
  filtroHistoricoClienteId: string = '';
  filtroHistoricoProdutoId: string = '';
  filtroHistoricoBusca: string = '';
  filtroHistoricoFormaPagamento: PaymentMethod | 'todos' = 'todos';
  filtrosHistoricoVisiveis: boolean = false;

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

  constructor(
    private productService: ProductService,
    private purchaseService: PurchaseService,
    private saleService: SaleService,
    private customerService: CustomerService,
    private billService: BillService,
    private purchaseProductService: PurchaseProductService,
    private orderService: OrderService,
    private comandaService: ComandaService,
    private notif: NotificationService
  ) { }

  ngOnInit() {
    // 0. Se a aba ativa for de um módulo desativado, volta para o relatório
    this.config.modules$.subscribe(m => {
      if ((this.activeTab === 'clientes' && !m.clientes) ||
          (this.activeTab === 'compras' && !m.compras)) {
        this.activeTab = 'relatorio';
      }
    });

    // 1. Carrega produtos em tempo real
    this.productService.getProducts().subscribe(data => {
      this.products = data;
      this.isLoading = false;
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
    });

    // 5. Carrega contas a pagar em tempo real
    this.billService.getBills().subscribe(data => {
      this.bills = data;
    });

    // 6. Carrega produtos de compra em tempo real
    this.purchaseProductService.getPurchaseProducts().subscribe(data => {
      this.purchaseProducts = data;
    });

    // 7. Carrega e combina Histórico Geral (PDV + Pedidos + Comandas)
    combineLatest([
      this.saleService.getSales(),
      this.orderService.getOrders(),
      this.comandaService.getAllComandas()
    ]).subscribe(([vendas, pedidos, comandas]) => {
      this.historicoItems = this.montarHistorico(vendas, pedidos, comandas);
      this.historicoCarregando = false;
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
      .map(v => ({
        id: v.id!,
        origem: 'pdv' as const,
        data: this.dataDoPedido(v.date),
        clienteNome: 'Balcão (sem cliente)',
        clienteId: undefined,
        status: v.status || 'completed',
        total: v.total || 0,
        paymentMethod: v.paymentMethod,
        installments: v.installments,
        itens: (v.items || []).map((i: any) => ({
          idProduct: i.idProduct, productName: i.productName, quantity: i.quantity
        }))
      }));

    const itensPedido: HistoricoItem[] = pedidos.map(p => ({
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
      itens: (p.items || []).map(i => ({
        idProduct: i.idProduct, productName: i.productName, quantity: i.quantity
      }))
    }));

    // Comandas guardam o nome do cliente como texto livre, não vinculado a
    // um Customer.id — por isso não entram no filtro por cliente (mesma
    // limitação que já existe hoje pras vendas de PDV no Relatório).
    const itensComanda: HistoricoItem[] = comandas.map(c => ({
      id: c.id!,
      origem: 'comanda' as const,
      data: this.dataDoPedido(c.createdAt),
      clienteNome: c.customerName || 'Sem nome',
      clienteId: undefined,
      status: c.status,
      total: c.total || 0,
      itens: (c.items || []).map((i: any) => ({
        idProduct: i.idProduct, productName: i.productName, quantity: i.quantity
      }))
    }));

    return [...itensPdv, ...itensPedido, ...itensComanda].sort((a, b) => {
      const ta = a.data ? a.data.getTime() : 0;
      const tb = b.data ? b.data.getTime() : 0;
      return tb - ta;
    });
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
  // GETTERS: CONTAS A PAGAR (aba relatorio sub-tab)
  // ==========================================================

  get totalContasPendentes(): number {
    return this.bills.filter(b => b.status === 'pendente').reduce((s, b) => s + b.value, 0);
  }

  get totalContasRecebidas(): number {
    return this.bills.filter(b => b.status === 'recebido').reduce((s, b) => s + b.value, 0);
  }

  get gastosPeriodo(): number {
    const inicio = new Date(this.filtroDataInicio + 'T00:00:00');
    const fim = new Date(this.filtroDataFim + 'T23:59:59');
    return this.bills
      .filter(b => b.status === 'pago' && b.paidAt)
      .filter(b => {
        const d = (b.paidAt as any)?.toDate ? (b.paidAt as any).toDate() : new Date(b.paidAt as any);
        return d >= inicio && d <= fim;
      })
      .reduce((s, b) => s + b.value, 0);
  }

  get resultadoFinal(): number {
    return this.relatorio.faturamento - this.relatorio.custoTotal - this.gastosPeriodo;
  }

  get billsFiltradosRelatorio(): Bill[] {
    const inicio = new Date(this.filtroDataInicio + 'T00:00:00');
    const fim = new Date(this.filtroDataFim + 'T23:59:59');
    let filtered = this.bills.filter(b => {
      const d = (b.createdAt as any)?.toDate ? (b.createdAt as any).toDate() : new Date();
      return d >= inicio && d <= fim;
    });
    if (this.filtroContasStatus !== 'todos') {
      filtered = filtered.filter(b => b.status === this.filtroContasStatus);
    }
    return filtered;
  }

  async avancarStatusBill(bill: Bill) {
    if (!bill.id || bill.status === 'pago') return;
    const next: Bill['status'] = bill.status === 'pendente' ? 'recebido' : 'pago';
    try {
      await this.billService.updateBillStatus(bill.id, next);
    } catch {
      this.notif.error('Erro ao atualizar status da conta.');
    }
  }

  billStatusLabel(status: Bill['status']): string {
    const labels: Record<Bill['status'], string> = {
      pendente: 'Pendente', recebido: 'Recebido', pago: 'Pago'
    };
    return labels[status];
  }

  formatBillDate(ts: any): string {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('pt-BR');
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
  atualizarRelatorio() {
    const inicio = new Date(this.filtroDataInicio + 'T00:00:00');
    const fim = new Date(this.filtroDataFim + 'T23:59:59');

    this.saleService.getSalesByDate(inicio, fim).subscribe(vendas => {
      let faturamento = 0;
      let custo = 0;
      let contagemVendas = 0;

      vendas.forEach((venda: any) => {
        // Filtro por Origem (PDV vs Pedidos/Massa)
        if (this.filtroOrigem !== 'todos' && venda.sale_type !== this.filtroOrigem) return;

        // Filtro por Cliente — PDV nunca terá customerId, só pedidos com vínculo passam
        if (this.filtroClienteId && venda.customerId !== this.filtroClienteId) return;

        // Filtro por Forma de Pagamento
        if (this.filtroFormaPagamento !== 'todos' && venda.paymentMethod !== this.filtroFormaPagamento) return;

        let vendaEntrouNoFiltro = false;
        if (venda.items) {
          venda.items.forEach((item: any) => {
            if (this.filtroProdutoId && item.idProduct !== this.filtroProdutoId) return;

            faturamento += (item.priceAtSale * item.quantity);
            custo += ((item.priceAtCost || 0) * item.quantity);
            vendaEntrouNoFiltro = true;
          });
        }
        if (vendaEntrouNoFiltro) contagemVendas++;
      });

      const lucro = faturamento - custo;
      this.relatorio = {
        faturamento,
        custoTotal: custo,
        lucro,
        qtdVendas: contagemVendas,
        margem: faturamento > 0 ? (lucro / faturamento * 100) : 0
      };

      // Atualiza os gráficos com os dados filtrados
      this.renderCharts(vendas);
    });
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
  renderCharts(vendas: any[]) {
    this.renderSalesHistoryChart(vendas);
    this.renderTopProductsChart(vendas);
  }

  renderSalesHistoryChart(vendas: any[]) {
    const ctx = document.getElementById('salesChart') as HTMLCanvasElement;
    if (!ctx) return;

    // Agrupa vendas por dia
    const salesByDay: { [key: string]: number } = {};

    // Preenche os dias entre inicio e fim para não ficar buraco no gráfico
    let current = new Date(this.filtroDataInicio + 'T00:00:00');
    const end = new Date(this.filtroDataFim + 'T23:59:59');

    while (current <= end) {
      const dayKey = current.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      salesByDay[dayKey] = 0;
      current.setDate(current.getDate() + 1);
    }

    vendas.forEach(v => {
      // Filtro por Origem
      if (this.filtroOrigem !== 'todos' && v.sale_type !== this.filtroOrigem) return;
      // Filtro por Cliente
      if (this.filtroClienteId && v.customerId !== this.filtroClienteId) return;
      // Filtro por Forma de Pagamento
      if (this.filtroFormaPagamento !== 'todos' && v.paymentMethod !== this.filtroFormaPagamento) return;

      const vDate = (v.date?.toDate ? v.date.toDate() : new Date(v.date));
      const dayKey = vDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

      let totalVenda = 0;
      v.items?.forEach((item: any) => {
        if (!this.filtroProdutoId || item.idProduct === this.filtroProdutoId) {
          totalVenda += (item.priceAtSale * item.quantity);
        }
      });

      if (salesByDay[dayKey] !== undefined) {
        salesByDay[dayKey] += totalVenda;
      }
    });

    const labels = Object.keys(salesByDay);
    const data = Object.values(salesByDay);

    if (this.salesChart) this.salesChart.destroy();

    this.salesChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Vendas (R$)',
          data,
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

  renderTopProductsChart(vendas: any[]) {
    const ctx = document.getElementById('topProductsChart') as HTMLCanvasElement;
    if (!ctx) return;

    const productsMap: { [key: string]: { name: string, qty: number } } = {};

    vendas.forEach(v => {
      // Filtro por Origem
      if (this.filtroOrigem !== 'todos' && v.sale_type !== this.filtroOrigem) return;
      // Filtro por Cliente
      if (this.filtroClienteId && v.customerId !== this.filtroClienteId) return;
      // Filtro por Forma de Pagamento
      if (this.filtroFormaPagamento !== 'todos' && v.paymentMethod !== this.filtroFormaPagamento) return;

      v.items?.forEach((item: any) => {
        if (!productsMap[item.idProduct]) {
          // Tenta pegar o nome do produto da lista principal caso não esteja no item da venda
          const prodInfo = this.products.find(p => p.id === item.idProduct);
          productsMap[item.idProduct] = { name: item.title || prodInfo?.title || 'Produto S/N', qty: 0 };
        }
        productsMap[item.idProduct].qty += item.quantity;
      });
    });

    // Ordena e pega os top 5
    const sorted = Object.values(productsMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    const labels = sorted.map(s => s.name);
    const data = sorted.map(s => s.qty);

    if (this.topProductsChart) this.topProductsChart.destroy();

    this.topProductsChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Qtd Vendida',
          data,
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
          legend: { display: false }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#888' }
          },
          y: {
            grid: { display: false },
            ticks: { color: '#fff' }
          }
        }
      }
    });
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
      color: '#f4c042'
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
      color: p.color || '#f4c042'
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

    try {
      if (this.produtoEmEdicao) {
        await this.productService.updateProduct(this.produtoEmEdicao.id!, this.novoProduto);
        this.notif.success('Produto atualizado com sucesso! ✅');
      } else {
        await this.productService.addProduct(this.novoProduto);
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
    this.gerarContaPagar = false;
    this.nomeConta = '';
  }

  async confirmarCompra() {
    if (!this.produtoSelecionadoCompra || this.dadosCompra.quantidade <= 0) {
      this.notif.warning('Informe uma quantidade válida! ⚠️');
      return;
    }

    const totalCompra = this.dadosCompra.quantidade * this.dadosCompra.novoPrecoCusto;

    try {
      await this.purchaseService.addPurchase({
        idProduct: this.produtoSelecionadoCompra.id!,
        amount: this.dadosCompra.quantidade,
        unityValue: this.dadosCompra.novoPrecoCusto,
        date: new Date()
      } as any);

      if (this.gerarContaPagar && totalCompra > 0) {
        const nome = this.nomeConta.trim() || `Compra: ${this.produtoSelecionadoCompra.title}`;
        await this.billService.addBill({
          name: nome,
          value: totalCompra,
          status: 'pendente',
          recurring: false
        });
      }

      this.notif.success(`Estoque de "${this.produtoSelecionadoCompra.title}" atualizado! 💰`);
      this.produtoSelecionadoCompra = null;
      this.gerarContaPagar = false;
      this.nomeConta = '';
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

  tipoEntregaLabel(tipo: 'pickup' | 'delivery'): string {
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
  // ABA 4: COMPRAS (PRODUTOS DE COMPRA)
  // ==========================================================

  abrirNovoCompra() {
    this.produtoCompraEmEdicao = null;
    this.novoProdutoCompra = { name: '', defaultValue: 0, recurring: false, recurrencePeriod: undefined };
    this.exibirFormularioCompra = true;
  }

  abrirEdicaoCompra(p: PurchaseProduct) {
    this.produtoCompraEmEdicao = p;
    this.novoProdutoCompra = {
      name: p.name,
      defaultValue: p.defaultValue,
      recurring: p.recurring,
      recurrencePeriod: p.recurrencePeriod
    };
    this.exibirFormularioCompra = true;
  }

  fecharFormularioCompra() {
    this.exibirFormularioCompra = false;
    this.produtoCompraEmEdicao = null;
  }

  async salvarProdutoCompra() {
    if (!this.novoProdutoCompra.name.trim() || this.novoProdutoCompra.defaultValue <= 0) {
      this.notif.warning('Preencha nome e valor.');
      return;
    }
    const data: Omit<PurchaseProduct, 'id' | 'createdAt' | 'companyId'> = {
      name: this.novoProdutoCompra.name.trim(),
      defaultValue: Number(this.novoProdutoCompra.defaultValue),
      recurring: this.novoProdutoCompra.recurring,
      ...(this.novoProdutoCompra.recurring && this.novoProdutoCompra.recurrencePeriod
        ? { recurrencePeriod: this.novoProdutoCompra.recurrencePeriod }
        : {})
    };
    try {
      if (this.produtoCompraEmEdicao?.id) {
        await this.purchaseProductService.updatePurchaseProduct(this.produtoCompraEmEdicao.id, data);
        this.notif.success('Produto atualizado!');
      } else {
        const newId = await this.purchaseProductService.addPurchaseProduct(data);
        await this.gerarBillDeProdutoCompra({ id: newId, ...data } as PurchaseProduct);
        this.notif.success('Produto cadastrado e fatura gerada!');
      }
      this.fecharFormularioCompra();
    } catch {
      this.notif.error('Erro ao salvar produto de compra.');
    }
  }

  async gerarBillDeProdutoCompra(p: PurchaseProduct) {
    const recPeriodMap: Record<string, 'semanal' | 'mensal'> = { weekly: 'semanal', monthly: 'mensal' };
    await this.billService.addBill({
      name: p.name,
      value: p.defaultValue,
      status: 'pendente',
      recurring: p.recurring,
      ...(p.recurring && p.recurrencePeriod ? { recurrencePeriod: recPeriodMap[p.recurrencePeriod!] } : {}),
      purchaseProductId: p.id
    });
  }

  openDeleteCompraModal(p: PurchaseProduct) {
    this.produtoCompraToDelete = p;
    this.isDeleteCompraModalOpen = true;
  }

  closeDeleteCompraModal() {
    this.isDeleteCompraModalOpen = false;
    this.produtoCompraToDelete = null;
  }

  async confirmDeleteCompra() {
    if (!this.produtoCompraToDelete?.id) return;
    try {
      await this.purchaseProductService.deletePurchaseProduct(this.produtoCompraToDelete.id);
      this.notif.success('Produto removido!');
      this.closeDeleteCompraModal();
    } catch {
      this.notif.error('Erro ao excluir produto de compra.');
    }
  }

  recurrenceLabel(period?: 'weekly' | 'monthly'): string {
    return period === 'weekly' ? 'Semanal' : period === 'monthly' ? 'Mensal' : '';
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