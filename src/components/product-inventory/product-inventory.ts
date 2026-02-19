import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

// Models e Services
import { Product } from '../../models/product-model';
import { ProductService } from '../../services/product-service/product-service';
import { SaleService } from '../../services/sale-service/sale-service';
import { PurchaseService } from '../../services/purchase-service/purchase-service';

@Component({
  selector: 'app-estoque',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './product-inventory.html',
  styleUrls: ['./product-inventory.css', './product-inventory-mobile.css']
})
export class ProductInventoryComponent implements OnInit {
  // Controle das Abas
  activeTab: 'relatorio' | 'estoque' = 'relatorio';

  // Controle de Visualização do Formulário
  exibirFormularioNovo: boolean = false;
  produtoEmEdicao: Product | null = null;

  // Lista de produtos
  products: Product[] = [];

  // --- FILTROS ---
  filtroDataInicio: string = '';
  filtroDataFim: string = '';
  filtroProdutoId: string = '';

  // --- NOTIFICAÇÕES CUSTOMIZADAS ---
  notification: string | null = null;
  notificationTimeout: any;

  // --- DADOS DO RELATÓRIO ---
  relatorio = {
    faturamento: 0,
    custoTotal: 0,
    lucro: 0,
    qtdVendas: 0,
    margem: 0
  };

  // --- DADOS PARA CADASTRO / EDIÇÃO (CAMPOS NOVOS ADICIONADOS) ---
  novoProduto: Product = {
    title: '',
    sellPrice: 0,
    buyPrice: 0,
    stock: 0,
    urlImage: '',
    color: '#FDD835' // Cor amarela padrão da Vermeiolandia
  };

  // --- DADOS PARA COMPRA (ENTRADA) ---
  produtoSelecionadoCompra: Product | null = null;
  dadosCompra = {
    quantidade: 0,
    novoPrecoCusto: 0
  };

  constructor(
    private productService: ProductService,
    private purchaseService: PurchaseService,
    private saleService: SaleService
  ) { }

  ngOnInit() {
    // 1. Carrega produtos em tempo real
    this.productService.getProducts().subscribe(data => {
      this.products = data;
    });

    // 2. Define datas iniciais como HOJE
    const hoje = new Date();
    this.filtroDataInicio = this.formatDateToInput(hoje);
    this.filtroDataFim = this.formatDateToInput(hoje);

    // 3. Calcula o relatório inicial
    this.atualizarRelatorio();
  }

  showNotification(message: string) {
    this.notification = message;
    if (this.notificationTimeout) clearTimeout(this.notificationTimeout);
    this.notificationTimeout = setTimeout(() => {
      this.notification = null;
    }, 3000);
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
    });
  }

  limparFiltros() {
    const hoje = new Date();
    this.filtroDataInicio = this.formatDateToInput(hoje);
    this.filtroDataFim = this.formatDateToInput(hoje);
    this.filtroProdutoId = '';
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
      color: '#FDD835'
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
      color: p.color || '#FDD835'
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
      this.showNotification('Preencha os campos obrigatórios! ⚠️');
      return;
    }

    try {
      if (this.produtoEmEdicao) {
        await this.productService.updateProduct(this.produtoEmEdicao.id!, this.novoProduto);
        this.showNotification('Produto atualizado com sucesso! ✅');
      } else {
        await this.productService.addProduct(this.novoProduto);
        this.showNotification('Produto cadastrado com sucesso! ✨');
      }
      this.fecharFormulario();
    } catch (error) {
      this.showNotification('Erro ao salvar produto ❌');
    }
  }

  async excluirProduto(id: string) {
    if (confirm('Deseja realmente excluir este produto?')) {
      try {
        await this.productService.deleteProduct(id);
        this.showNotification('Produto removido! 🗑️');
      } catch (error) {
        this.showNotification('Erro ao excluir ❌');
      }
    }
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
      this.showNotification('Informe uma quantidade válida! ⚠️');
      return;
    }

    try {
      await this.purchaseService.addPurchase({
        idProduct: this.produtoSelecionadoCompra.id!,
        amount: this.dadosCompra.quantidade,
        unityValue: this.dadosCompra.novoPrecoCusto,
        date: new Date()
      } as any);

      this.showNotification(`Estoque de "${this.produtoSelecionadoCompra.title}" atualizado! 💰`);
      this.produtoSelecionadoCompra = null;
    } catch (error) {
      this.showNotification('Erro ao registrar entrada ❌');
    }
  }

  cancelarSelecaoCompra() {
    this.produtoSelecionadoCompra = null;
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