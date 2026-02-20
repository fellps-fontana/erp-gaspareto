import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Product } from '../../models/product-model';
import { Observable } from 'rxjs';
import { ProductService } from '../../services/product-service/product-service';
import { SaleService } from '../../services/sale-service/sale-service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-pdv',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './pdv.html',
  styleUrls: ['./pdv.css']
})
export class PdvComponent implements OnInit {
  products$!: Observable<Product[]>;
  cart: any[] = [];
  total: number = 0;
  isCartOpen: boolean = false;

  // --- CONTROLE DE NOTIFICAÇÃO ---
  notification: string | null = null;
  notificationTimeout: any;

  constructor(
    private productService: ProductService,
    private saleService: SaleService
  ) { }

  ngOnInit() {
    // Carrega produtos em tempo real do Firestore
    this.products$ = this.productService.getProducts();
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

  toggleCart() {
    this.isCartOpen = !this.isCartOpen;
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

  async fecharVenda() {
    if (this.cart.length === 0) return;

    const itensLimpos = this.cart.map(i => ({
      idProduct: i.idProduct,
      productName: i.name, // Ajustei aqui pra 'productName' pra bater com o service que você mandou antes
      quantity: Number(i.quantity),
      priceAtSale: Number(i.priceAtSale),
      priceAtCost: Number(i.priceAtCost || 0)
    }));

    try {
      const sale = {
        items: itensLimpos,
        total: Number(this.total),
        sale_type: 'pdv',
        date: new Date()
      };

      await this.saleService.processSale(sale);

      this.showNotification('Venda Confirmada! ✅');

      this.cart = [];
      this.total = 0;
      this.isCartOpen = false;
    } catch (e: any) {
      this.showNotification(e.message || 'Erro ao processar venda ❌'); // Usei e.message pra ver o erro real do estoque
      console.error(e);
    }
  }
}