import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, map } from 'rxjs'; // Importei o map pra filtrar

// Models
import { Product } from '../../../models/product-model';
import { Order } from '../../../models/order-model';
import { PaymentMethod } from '../../../models/sell-model';
import { ProductService } from '../../../services/product-service/product-service';
import { OrderService } from '../../../services/order-service/order-service';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './order.html',
  styleUrls: ['./order.css']
})
export class OrdersComponent implements OnInit {
  
  // --- DADOS DO BANCO ---
  products$!: Observable<Product[]>;
  orders$!: Observable<Order[]>;

  // --- CONTROLE DE FILTROS ---
  filterStatus: 'all' | 'pending' | 'delivery' = 'all';

  // --- CONTROLE DO OVERLAY (NOVO PEDIDO) ---
  isNewOrderOpen: boolean = false;
  
  // --- FORMULÁRIO DE NOVO PEDIDO ---
  cart: any[] = [];
  customerName: string = '';
  customerPhone: string = '';
  deliveryType: 'pickup' | 'delivery' = 'pickup'; // Padrão: Retirada
  address: string = '';
  shippingCost: number = 0; // Frete Manual
  observations: string = '';

  // --- CONTROLE DE PAGAMENTO (MODAL FINAL) ---
  isPaymentModalOpen: boolean = false;
  selectedOrderToFinalize: Order | null = null;
  selectedPaymentMethod: PaymentMethod = PaymentMethod.DINHEIRO;

  constructor(
    private productService: ProductService,
    private orderService: OrderService
  ) {}

  ngOnInit() {
    // Carrega produtos para o grid de seleção
    this.products$ = this.productService.getProducts();
    
    // Carrega pedidos (PENDENTES E EM ANDAMENTO)
    this.orders$ = this.orderService.getPendingOrders();
  }

  // --- LÓGICA DE FILTRO (COMPUTADA) ---
  get filteredOrders$(): Observable<Order[]> {
    return this.orders$.pipe(
      map(orders => {
        if (this.filterStatus === 'all') return orders;
        
        if (this.filterStatus === 'pending') {
          return orders.filter(o => o.status === 'pending' || o.status === 'preparing');
        }
        
        if (this.filterStatus === 'delivery') {
          return orders.filter(o => o.status === 'delivered'); // Ou 'delivering'
        }
        
        return orders;
      })
    );
  }

  // =============================================================
  // 🛒 LÓGICA DO CARRINHO (NOVO PEDIDO)
  // =============================================================

  openNewOrder() {
    this.clearForm();
    this.isNewOrderOpen = true;
  }

  closeNewOrder() {
    this.isNewOrderOpen = false;
  }

  addToCart(p: Product) {
    const item = this.cart.find(i => i.idProduct === p.id);
    if (item) {
      item.quantity++;
    } else {
      this.cart.push({
        idProduct: p.id,
        productName: p.title || 'Produto sem nome',
        quantity: 1,
        priceAtSale: Number(p.sellPrice) || 0,
        priceAtCost: Number(p.buyPrice) || 0
      });
    }
  }

  removeFromCart(item: any) {
    const index = this.cart.indexOf(item);
    if (index > -1) {
      this.cart.splice(index, 1);
    }
  }

  // Cálculos de Totais
  get itemsTotal(): number {
    return this.cart.reduce((acc, item) => acc + (item.priceAtSale * item.quantity), 0);
  }

  get finalTotal(): number {
    return this.itemsTotal + Number(this.shippingCost);
  }

  // Salvar no Banco
  async saveOrder() {
    // Validações Básicas
    if (!this.customerName || this.cart.length === 0) {
      alert('⚠️ Preencha o nome do cliente e adicione produtos!');
      return;
    }

    if (this.deliveryType === 'delivery' && !this.address) {
      alert('⚠️ Para entrega, informe o endereço!');
      return;
    }

    try {
      // Monta o objeto Order
      const newOrder: any = {
        customerName: this.customerName,
        customerPhone: this.customerPhone,
        items: this.cart,
        
        itemsTotal: this.itemsTotal,
        shippingCost: Number(this.shippingCost),
        total: this.finalTotal, // Soma tudo aqui
        
        deliveryType: this.deliveryType,
        address: this.address,
        observations: this.observations
        // Status e datas o Service resolve
      };

      await this.orderService.addOrder(newOrder);
      
      alert('✅ Pedido Agendado com Sucesso!');
      this.closeNewOrder();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('❌ Erro ao salvar pedido. Veja o console.');
    }
  }

  clearForm() {
    this.cart = [];
    this.customerName = '';
    this.customerPhone = '';
    this.address = '';
    this.shippingCost = 0;
    this.deliveryType = 'pickup';
    this.observations = '';
  }

  // =============================================================
  // 🚀 LÓGICA DE STATUS (KANBAN / FLUXO)
  // =============================================================

  // Tradutor simples pro HTML
  translateStatus(status: string): string {
    const map: any = { 
      'pending': '⏳ Pendente', 
      'preparing': '🔥 Preparando', 
      'delivered': '🚚 Entregue / Retirado', 
      'finished': '✅ Finalizado' 
    };
    return map[status] || status;
  }

  // Define o texto do botão de ação baseado no estado atual
  getNextActionLabel(status: string): string {
    if (status === 'pending') return '🚚 Saiu p/ Entrega'; // Simplifiquei: Pendente -> Entregue
    if (status === 'delivered') return '💰 Receber & Finalizar';
    return 'Detalhes';
  }

  // A função principal que move o pedido pra frente
  advanceStatus(order: Order) {
    if (order.status === 'pending' || order.status === 'preparing') {
      // Avança para ENTREGUE (Saiu da loja)
      this.markDelivered(order);
    } 
    else if (order.status === 'delivered') {
      // Avança para PAGAMENTO (Receber grana)
      this.openPaymentModal(order);
    }
  }

  async markDelivered(order: Order) {
    const msg = order.deliveryType === 'delivery' 
      ? `Confirmar saída para entrega de ${order.customerName}?`
      : `Confirmar retirada no balcão por ${order.customerName}?`;

    if(confirm(msg)) {
      await this.orderService.markAsDelivered(order.id!);
    }
  }

  // =============================================================
  // 💰 PAGAMENTO & FINALIZAÇÃO
  // =============================================================

  openPaymentModal(order: Order) {
    this.selectedOrderToFinalize = order;
    this.selectedPaymentMethod = PaymentMethod.DINHEIRO; // Reset pro padrão
    this.isPaymentModalOpen = true;
  }

  async confirmPayment() {
    if (!this.selectedOrderToFinalize) return;

    try {
      await this.orderService.finalizeOrder(
        this.selectedOrderToFinalize, 
        this.selectedPaymentMethod
      );
      
      this.isPaymentModalOpen = false;
      this.selectedOrderToFinalize = null;
      alert('💰 Pagamento registrado e Venda criada!');
      
    } catch (error) {
      console.error(error);
      alert('Erro ao finalizar pagamento.');
    }
  }
  
  // Abre detalhes (opcional, se quiser só ver)
  viewDetails(order: Order) {
    console.log(order); 
    // Futuramente você pode abrir um modal só de leitura aqui
  }
}