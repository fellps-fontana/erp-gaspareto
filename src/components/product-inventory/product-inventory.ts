import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

// Models e Services
import { Product } from '../../models/product-model';
import { Customer } from '../../models/customer-model';
import { Bill } from '../../models/bill-model';
import { PurchaseProduct } from '../../models/purchase-product-model';
import { ProductService } from '../../services/product-service/product-service';
import { SaleService } from '../../services/sale-service/sale-service';
import { PurchaseService } from '../../services/purchase-service/purchase-service';
import { CustomerService } from '../../services/customer-service/customer-service';
import { BillService } from '../../services/bill-service/bill-service';
import { PurchaseProductService } from '../../services/purchase-product-service/purchase-product-service';
import { NotificationService } from '../../services/notification-service/notification.service';

@Component({
  selector: 'app-estoque',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './product-inventory.html',
  styleUrls: ['./product-inventory.css', './product-inventory-mobile.css']
})
export class ProductInventoryComponent implements OnInit {
  // Controle das Abas
  activeTab: 'relatorio' | 'estoque' | 'clientes' | 'compras' = 'relatorio';
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
  novoProduto: Product = {
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
  novoProdutoCompra: Omit<PurchaseProduct, 'id' | 'createdAt'> = {
    name: '',
    defaultValue: 0,
    recurring: false,
    recurrencePeriod: undefined
  };

  // --- CLIENTES ---
  customers: Customer[] = [];
  clienteEmEdicao: Customer | null = null;
  exibirFormularioCliente: boolean = false;
  novoCliente: Omit<Customer, 'id'> = { name: '', phone: '', address: '' };
  isDeleteClienteModalOpen: boolean = false;
  clienteToDelete: Customer | null = null;

  // campos de endereço por CEP
  clienteCep = '';
  clienteRua = '';
  clienteBairro = '';
  clienteCidade = '';
  clienteUf = '';
  clienteNumero = '';
  clienteComplemento = '';
  clienteCepLoading = false;
  clienteCepError = '';

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
    private notif: NotificationService
  ) { }

  ngOnInit() {
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
      pendente: 'Pendente', recebido: 'A Pagar', pago: 'Pago'
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
    this.novoCliente = { name: '', phone: '', address: '' };
    this.limparCamposCep();
    this.exibirFormularioCliente = true;
  }

  abrirEdicaoCliente(c: Customer) {
    this.clienteEmEdicao = c;
    this.novoCliente     = { name: c.name, phone: c.phone || '', address: c.address || '' };
    this.clienteCep          = c.cep         ?? '';
    this.clienteRua          = c.rua         ?? c.address ?? '';
    this.clienteNumero       = c.numero      ?? '';
    this.clienteComplemento  = c.complemento ?? '';
    this.clienteBairro       = c.bairro      ?? '';
    this.clienteCidade       = c.cidade      ?? '';
    this.clienteUf           = c.uf          ?? '';
    this.clienteCepError     = '';
    this.exibirFormularioCliente = true;
  }

  fecharFormularioCliente() {
    this.exibirFormularioCliente = false;
    this.clienteEmEdicao = null;
  }

  private limparCamposCep() {
    this.clienteCep = '';
    this.clienteRua = '';
    this.clienteBairro = '';
    this.clienteCidade = '';
    this.clienteUf = '';
    this.clienteNumero = '';
    this.clienteComplemento = '';
    this.clienteCepError = '';
  }

  onClienteCepInput() {
    const digits = this.clienteCep.replace(/\D/g, '');
    if (digits.length > 8) { this.clienteCep = this.clienteCep.slice(0, 9); return; }
    this.clienteCep = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    this.clienteCepError = '';
    if (digits.length === 8) {
      this.buscarCep(digits);
    } else {
      this.clienteRua = '';
      this.clienteBairro = '';
      this.clienteCidade = '';
      this.clienteUf = '';
      this.clienteNumero = '';
      this.clienteComplemento = '';
    }
  }

  private async buscarCep(cep: string) {
    this.clienteCepLoading = true;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) { this.clienteCepError = 'CEP não encontrado.'; return; }
      this.clienteRua    = data.logradouro || '';
      this.clienteBairro = data.bairro     || '';
      this.clienteCidade = data.localidade || '';
      this.clienteUf     = data.uf         || '';
    } catch {
      this.clienteCepError = 'Erro ao buscar CEP.';
    } finally {
      this.clienteCepLoading = false;
    }
  }

  async salvarCliente() {
    if (!this.novoCliente.name?.trim()) {
      this.notif.warning('O nome do cliente é obrigatório!');
      return;
    }
    const address = this.clienteFormattedAddress || this.novoCliente.address || '';
    const data: Omit<Customer, 'id'> = {
      name:        this.novoCliente.name.trim(),
      phone:       this.novoCliente.phone?.trim() || '',
      address,
      cep:         this.clienteCep,
      rua:         this.clienteRua,
      numero:      this.clienteNumero,
      complemento: this.clienteComplemento,
      bairro:      this.clienteBairro,
      cidade:      this.clienteCidade,
      uf:          this.clienteUf,
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
    const data: Omit<PurchaseProduct, 'id' | 'createdAt'> = {
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