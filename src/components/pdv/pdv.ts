import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Product } from '../../models/product-model';
import { Observable } from 'rxjs';
import { ProductService } from '../../services/product-service/product-service';
import { SaleService } from '../../services/sale-service/sale-service';
import { ComandaService } from '../../services/comanda-service/comanda-service';
import { NotificationService } from '../../services/notification-service/notification.service';
import { PaymentMethod, SaleItem } from '../../models/sell-model';
import { Comanda } from '../../models/comanda-model';
import {
  bloqueiaAdicaoPorPeso,
  calcularTotalItemPorPeso,
  normalizarPeso,
  validarPeso
} from '../../services/product-service/product-weight-rules';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-pdv',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pdv.html',
  styleUrls: ['./pdv.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PdvComponent implements OnInit {
  products$!: Observable<Product[]>;
  isLoadingProducts = true;
  cart: SaleItem[] = [];
  total: number = 0;
  isCartOpen: boolean = false;

  // --- CONTROLE DE CHECKOUT/COMANDA ---
  isCheckoutModalOpen: boolean = false;
  checkoutStep: 'choice' | 'payment-method' | 'comanda-selection' | 'new-comanda' = 'choice';
  PaymentMethod = PaymentMethod;
  paymentMethod: PaymentMethod = PaymentMethod.DINHEIRO;
  comandaName: string = '';
  selectedComanda: Comanda | null = null;

  openComandas: Comanda[] = [];
  isComandaListOpen: boolean = false;
  private comandaSub?: Subscription;

  // Variável para quando estivermos pagando uma comanda pronta
  comandaBeingPaid: Comanda | null = null;
  expandedComandaId: string | null = null;

  // --- CONTROLE DE EXCLUSÃO (MODAL ESTILIZADO) ---
  isDeleteModalOpen: boolean = false;
  comandaToDelete: Comanda | null = null;

  // --- CÁLCULO DE TROCO ---
  amountReceived: number = 0;
  get change(): number {
    const totalToPay = this.comandaBeingPaid ? this.comandaBeingPaid.total : this.total;
    const diff = (this.amountReceived || 0) - totalToPay;
    return diff > 0 ? diff : 0;
  }

  constructor(
    private productService: ProductService,
    private saleService: SaleService,
    private comandaService: ComandaService,
    private cdr: ChangeDetectorRef,
    private notif: NotificationService
  ) { }

  ngOnInit() {
    // Carrega produtos em tempo real do Firestore
    this.products$ = this.productService.getProducts();
    this.productService.getProducts().subscribe({ next: () => { this.isLoadingProducts = false; this.cdr.markForCheck(); } });

    // Carrega comandas abertas
    this.comandaSub = this.comandaService.getOpenComandas().subscribe({
      next: (comandas) => {
        this.openComandas = comandas;
        this.cdr.markForCheck(); // Notifica o Angular que os dados mudaram
      },
      error: (err) => console.error('PdvComponent: [ERRO] Falha ao carregar comandas:', err)
    });
  }

  ngOnDestroy() {
    if (this.comandaSub) this.comandaSub.unsubscribe();
  }

  // --- MODAL DE CHECKOUT ---
  openCheckout() {
    if (this.cart.length === 0) return;
    this.isCheckoutModalOpen = true;
    this.checkoutStep = 'choice';
    this.paymentMethod = PaymentMethod.DINHEIRO;
    this.amountReceived = 0;
    this.comandaName = '';
    this.selectedComanda = null;
    this.comandaBeingPaid = null;
  }

  // Novo: Pagar uma comanda que já está aberta
  checkoutComanda(comanda: Comanda) {
    this.comandaBeingPaid = comanda;
    this.isCheckoutModalOpen = true;
    this.checkoutStep = 'payment-method';
    this.paymentMethod = PaymentMethod.DINHEIRO;
    this.amountReceived = 0;
    this.isComandaListOpen = false;
  }

  setStep(step: any) {
    this.checkoutStep = step;
    this.cdr.markForCheck();
  }

  closeCheckout() {
    this.isCheckoutModalOpen = false;
  }

  toggleComandaList() {
    this.isComandaListOpen = !this.isComandaListOpen;
    if (this.isComandaListOpen) this.isCartOpen = false;
  }

  toggleCart() {
    this.isCartOpen = !this.isCartOpen;
    if (this.isCartOpen) this.isComandaListOpen = false;
  }

  toggleComandaItems(comandaId: string) {
    this.expandedComandaId = this.expandedComandaId === comandaId ? null : comandaId;
    this.cdr.markForCheck();
  }

  // Fallback de ícone caso o produto não tenha imagem cadastrada
  getProductIcon(title: string): string {
    const t = title.toLowerCase();
    if (t.includes('cerveja') || t.includes('chopp')) return '🍺';
    if (t.includes('vinho')) return '🍷';
    if (t.includes('drink')) return '🍹';
    if (t.includes('suco')) return '🧃';
    if (t.includes('água')) return '💧';
    if (t.includes('pizza')) return '🍕';
    if (t.includes('massa') || t.includes('tortei')) return '🍝';
    return '🥤';
  }

  getQuantity(p: Product): number {
    const item = this.cart.find(i => i.idProduct === p.id);
    return item ? item.quantity : 0;
  }

  /** Rótulo do badge no card do produto: peso mostra "kg", unidade mostra a contagem. */
  badgeQuantidade(p: Product): string {
    const item = this.cart.find(i => i.idProduct === p.id);
    if (!item) return '';
    return item.soldByWeight ? 'kg' : String(item.quantity);
  }

  addToCart(p: Product) {
    if (!p.id) return;

    // Verificação de estoque antes de adicionar
    if (p.stock === undefined || p.stock <= 0) {
      this.notif.warning('⚠️ Estoque insuficiente! Não é possível vender este item.');
      return;
    }

    const existingItem = this.cart.find(item => item.idProduct === p.id);

    if (p.soldByWeight) {
      // Produto vendido por peso: linha única por venda — não soma nem duplica.
      if (bloqueiaAdicaoPorPeso(this.cart, p.id, true)) {
        this.notif.warning('⚠️ Produto vendido por peso já está no carrinho. Ajuste o peso na lista.');
        return;
      }
      this.cart.push({
        idProduct: p.id,
        productName: p.title || 'Produto',
        quantity: 1, // semente: 1,000 kg, editável na lista
        priceAtSale: p.sellPrice || 0,
        priceAtCost: p.buyPrice || 0,
        soldByWeight: true
      });
    } else if (existingItem) {
      // Verifica se a quantidade no carrinho não excede o estoque real
      if (existingItem.quantity >= p.stock) {
        this.notif.warning('⚠️ Estoque insuficiente! Não é possível vender este item.');
        return;
      }
      existingItem.quantity += 1;
    } else {
      this.cart.push({
        idProduct: p.id,
        productName: p.title || 'Produto',
        quantity: 1,
        priceAtSale: p.sellPrice || 0,
        priceAtCost: p.buyPrice || 0
      });
    }

    // Abre o carrinho automaticamente apenas em telas maiores (Tablet/Desktop)
    if (window.innerWidth >= 768) {
      this.isCartOpen = true;
    }
    this.atualizarTotal();
    this.cdr.markForCheck();
  }

  decreaseItemById(idProduct: string, index: number) {
    const item = this.cart[index];
    if (item?.soldByWeight) {
      // Peso não decrementa: o botão vira "remover" na linha.
      this.removeCartItem(index);
      return;
    }
    if (item.quantity > 1) {
      item.quantity -= 1;
    } else {
      this.cart.splice(index, 1);
      if (this.cart.length === 0) this.isCartOpen = false;
    }
    this.atualizarTotal();
    this.cdr.markForCheck();
  }

  removeCartItem(index: number) {
    this.cart.splice(index, 1);
    if (this.cart.length === 0) this.isCartOpen = false;
    this.atualizarTotal();
    this.cdr.markForCheck();
  }

  /**
   * Handler do input de peso (kg) para item vendido por peso.
   * Validação delegada a `validarPeso` (product-weight-rules); valor inválido só avisa.
   */
  onPesoInputChange(item: SaleItem, value: number | string) {
    const peso = normalizarPeso(value);
    const resultado = validarPeso(peso);
    if (!resultado.valido) {
      this.notif.warning('⚠️ ' + resultado.erro);
      return;
    }
    item.quantity = peso;
    this.atualizarTotal();
    this.cdr.markForCheck();
  }

  /** Total em dinheiro de uma linha — delega o cálculo por peso à regra pura. */
  totalLinha(item: SaleItem): number {
    return item.soldByWeight
      ? calcularTotalItemPorPeso(item.priceAtSale, item.quantity)
      : item.priceAtSale * item.quantity;
  }

  /** Rótulo de quantidade conforme locale: "1,25 kg" para peso, "2x" para unidade. */
  qtyLabel(item: SaleItem): string {
    if (item.soldByWeight) {
      return `${item.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`;
    }
    return `${item.quantity}x`;
  }

  /** true se algum item de peso do carrinho está com peso inválido — avisa e bloqueia o checkout. */
  private carrinhoComPesoInvalido(): boolean {
    const invalida = this.cart.find(i => i.soldByWeight && !validarPeso(i.quantity).valido);
    if (invalida) {
      this.notif.warning('⚠️ ' + validarPeso(invalida.quantity).erro);
      return true;
    }
    return false;
  }

  atualizarTotal() {
    this.total = this.cart.reduce((acc, item) => acc + this.totalLinha(item), 0);
    this.cdr.markForCheck();
  }

  async finalizarCheckout() {
    try {
      if (this.checkoutStep === 'payment-method') {
        if (!this.comandaBeingPaid && this.carrinhoComPesoInvalido()) return;
        const itens = this.comandaBeingPaid ? this.comandaBeingPaid.items : this.cart.map(i => ({
          idProduct: i.idProduct,
          productName: i.productName,
          quantity: Number(i.quantity),
          priceAtSale: Number(i.priceAtSale),
          priceAtCost: Number(i.priceAtCost || 0),
          soldByWeight: !!i.soldByWeight
        }));

        const totalValue = this.comandaBeingPaid ? this.comandaBeingPaid.total : this.total;

        const sale = {
          items: itens,
          total: Number(totalValue),
          sale_type: 'pdv',
          paymentMethod: this.paymentMethod,
          date: new Date()
        };

        const shouldUpdateStock = !this.comandaBeingPaid;
        await this.saleService.processSale(sale as any, shouldUpdateStock);

        if (this.comandaBeingPaid) {
          await this.comandaService.closeComanda(this.comandaBeingPaid.id!);
          this.notif.success('Comanda Paga e Fechada! ✅');
        } else {
          this.notif.success('Venda Confirmada! ✅');
        }

      } else if (this.checkoutStep === 'new-comanda') {
        if (!this.comandaName.trim()) {
          this.notif.warning('⚠️ Digite o nome da comanda!');
          return;
        }
        if (this.carrinhoComPesoInvalido()) return;
        const newComanda = {
          customerName: this.comandaName,
          items: this.cart.map(i => ({
            idProduct: i.idProduct,
            productName: i.productName,
            quantity: Number(i.quantity),
            priceAtSale: Number(i.priceAtSale),
            priceAtCost: Number(i.priceAtCost || 0),
            soldByWeight: !!i.soldByWeight
          })),
          total: Number(this.total)
        };
        await this.comandaService.addComanda(newComanda);
        this.notif.success('Nova Comanda Criada! 📋');

      } else if (this.checkoutStep === 'comanda-selection') {
        if (!this.selectedComanda) {
          this.notif.warning('⚠️ Selecione uma comanda!');
          return;
        }
        if (this.carrinhoComPesoInvalido()) return;
        // Pré-checagem de UX: produto por peso não soma em comanda existente
        // (o service tem backstop que lança erro cru — aqui a mensagem é amigável).
        const bloqueado = this.cart.find(i =>
          bloqueiaAdicaoPorPeso(this.selectedComanda!.items, i.idProduct, !!i.soldByWeight)
        );
        if (bloqueado) {
          this.notif.warning(
            '⚠️ Produto vendido por peso já está nesta comanda e não pode ser somado. ' +
            'Finalize esta comanda ou abra outra.'
          );
          return;
        }
        const itemsToAdd = this.cart.map(i => ({
          idProduct: i.idProduct,
          productName: i.productName,
          quantity: Number(i.quantity),
          priceAtSale: Number(i.priceAtSale),
          priceAtCost: Number(i.priceAtCost || 0),
          soldByWeight: !!i.soldByWeight
        }));
        await this.comandaService.addToExistingComanda(this.selectedComanda.id!, itemsToAdd, this.total);
        this.notif.success(`Adicionado à comanda de ${this.selectedComanda.customerName}! 📋`);
      }

      this.limparPdv();
      this.cdr.markForCheck();
    } catch (e: any) {
      this.notif.error(e.message || 'Erro ao processar. ❌');
      this.cdr.markForCheck();
      console.error(e);
    }
  }

  limparPdv() {
    this.cart = [];
    this.total = 0;
    this.isCartOpen = false;
    this.isCheckoutModalOpen = false;
    this.comandaBeingPaid = null;
    this.selectedComanda = null;
    this.comandaName = '';
    this.cdr.markForCheck();
  }

  selectComanda(c: Comanda) {
    this.selectedComanda = c;
    this.cdr.markForCheck();
  }

  // --- OTIMIZAÇÃO DE PERFORMANCE (trackBy) ---
  trackByProductId(index: number, product: Product): string {
    return product.id || String(index);
  }

  trackByCartItem(index: number, item: SaleItem): string {
    return item.idProduct || String(index);
  }

  trackByComandaId(index: number, comanda: Comanda): string {
    return comanda.id || String(index);
  }

  deleteComanda(c: Comanda) {
    if (!c.id) return;
    this.comandaToDelete = c;
    this.isDeleteModalOpen = true;
  }

  closeDeleteModal() {
    this.isDeleteModalOpen = false;
    this.comandaToDelete = null;
  }

  async confirmDelete() {
    if (!this.comandaToDelete || !this.comandaToDelete.id) return;

    try {
      await this.comandaService.deleteComanda(this.comandaToDelete.id);
      this.notif.success('Comanda excluída com sucesso! ✅');
      this.closeDeleteModal();
    } catch (err) {
      console.error(err);
      this.notif.error('Erro ao excluir comanda. ❌');
    }
  }
}