import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Product } from '../../models/product-model';
import { Observable } from 'rxjs';
import { ProductService } from '../../services/product-service/product-service';
import { SaleService } from '../../services/sale-service/sale-service';
import { ComandaService } from '../../services/comanda-service/comanda-service';
import { PaymentMethod } from '../../models/sell-model';
import { Comanda } from '../../models/comanda-model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-pdv',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pdv.html',
  styleUrls: ['./pdv.css']
})
export class PdvComponent implements OnInit {
  products$!: Observable<Product[]>;
  cart: any[] = [];
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

  // --- CONTROLE DE NOTIFICAÇÃO ---
  notification: string | null = null;
  notificationTimeout: any;

  constructor(
    private productService: ProductService,
    private saleService: SaleService,
    private comandaService: ComandaService
  ) { }

  ngOnInit() {
    // Carrega produtos em tempo real do Firestore
    this.products$ = this.productService.getProducts();

    // Carrega comandas abertas
    this.comandaSub = this.comandaService.getOpenComandas().subscribe(comandas => {
      this.openComandas = comandas;
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
    this.isComandaListOpen = false;
  }

  setStep(step: any) {
    this.checkoutStep = step;
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
  }

  // --- EXIBIR NOTIFICAÇÃO (Toast) ---
  showNotification(message: string) {
    this.notification = message;

    if (this.notificationTimeout) {
      clearTimeout(this.notificationTimeout);
    }

    this.notificationTimeout = setTimeout(() => {
      this.notification = null;
    }, 3000);
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

  addToCart(p: Product) {
    if (!p.id) return;

    // Verificação de estoque antes de adicionar
    if (p.stock === undefined || p.stock <= 0) {
      this.showNotification('⚠️ Produto sem estoque disponível!');
      return;
    }

    const existingItem = this.cart.find(item => item.idProduct === p.id);

    if (existingItem) {
      // Verifica se a quantidade no carrinho não excede o estoque real
      if (existingItem.quantity >= p.stock) {
        this.showNotification('⚠️ Limite de estoque atingido!');
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
  }

  decreaseItemById(idProduct: string, index: number) {
    if (this.cart[index].quantity > 1) {
      this.cart[index].quantity -= 1;
    } else {
      this.cart.splice(index, 1);
      if (this.cart.length === 0) this.isCartOpen = false;
    }
    this.atualizarTotal();
  }

  atualizarTotal() {
    this.total = this.cart.reduce((acc, item) => acc + (item.priceAtSale * item.quantity), 0);
  }

  async finalizarCheckout() {
    try {
      if (this.checkoutStep === 'payment-method') {
        const itens = this.comandaBeingPaid ? this.comandaBeingPaid.items : this.cart.map(i => ({
          idProduct: i.idProduct,
          productName: i.productName,
          quantity: Number(i.quantity),
          priceAtSale: Number(i.priceAtSale),
          priceAtCost: Number(i.priceAtCost || 0)
        }));

        const totalValue = this.comandaBeingPaid ? this.comandaBeingPaid.total : this.total;

        const sale = {
          items: itens,
          total: Number(totalValue),
          sale_type: 'pdv',
          paymentMethod: this.paymentMethod,
          date: new Date()
        };

        await this.saleService.processSale(sale as any);

        if (this.comandaBeingPaid) {
          await this.comandaService.closeComanda(this.comandaBeingPaid.id!);
          this.showNotification('Comanda Paga e Fechada! ✅');
        } else {
          this.showNotification('Venda Confirmada! ✅');
        }

      } else if (this.checkoutStep === 'new-comanda') {
        if (!this.comandaName.trim()) {
          this.showNotification('⚠️ Digite o nome da comanda!');
          return;
        }
        const newComanda = {
          customerName: this.comandaName,
          items: this.cart.map(i => ({
            idProduct: i.idProduct,
            productName: i.productName,
            quantity: Number(i.quantity),
            priceAtSale: Number(i.priceAtSale),
            priceAtCost: Number(i.priceAtCost || 0)
          })),
          total: Number(this.total)
        };
        await this.comandaService.addComanda(newComanda);
        this.showNotification('Nova Comanda Criada! 📋');

      } else if (this.checkoutStep === 'comanda-selection') {
        if (!this.selectedComanda) {
          this.showNotification('⚠️ Selecione uma comanda!');
          return;
        }
        const itemsToAdd = this.cart.map(i => ({
          idProduct: i.idProduct,
          productName: i.productName,
          quantity: Number(i.quantity),
          priceAtSale: Number(i.priceAtSale),
          priceAtCost: Number(i.priceAtCost || 0)
        }));
        await this.comandaService.addToExistingComanda(this.selectedComanda.id!, itemsToAdd, this.total);
        this.showNotification(`Adicionado à comanda de ${this.selectedComanda.customerName}! 📋`);
      }

      this.limparPdv();
    } catch (e: any) {
      this.showNotification(e.message || 'Erro ao processar ❌');
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
  }

  selectComanda(c: Comanda) {
    this.selectedComanda = c;
  }

  // --- OTIMIZAÇÃO DE PERFORMANCE (trackBy) ---
  trackByProductId(index: number, product: Product): string {
    return product.id || String(index);
  }

  trackByCartItem(index: number, item: any): string {
    return item.idProduct || String(index);
  }

  trackByComandaId(index: number, comanda: Comanda): string {
    return comanda.id || String(index);
  }
}