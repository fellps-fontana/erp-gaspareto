import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, map, catchError, of } from 'rxjs';

// Models
import { Product } from '../../models/product-model';
import { Order, OrderItem } from '../../models/order-model';
import { PaymentMethod } from '../../models/sell-model';
import { ProductService } from '../../services/product-service/product-service';
import { OrderService } from '../../services/order-service/order-service';
import { Timestamp } from '@angular/fire/firestore';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './order.html',
  styleUrls: ['./order.css', './order_mobile.css', './order_details.css']
})
export class OrdersComponent implements OnInit {
  private productService = inject(ProductService);
  private orderService = inject(OrderService);
  private router = inject(Router);

  // --- DADOS DO BANCO ---
  products$!: Observable<Product[]>;
  orders$!: Observable<Order[]>;
  filteredOrders$!: Observable<Order[]>; // Alterado para property

  // --- CONTROLE DE FILTROS ---
  private _filterStatus: 'all' | 'pending' | 'delivered' = 'all';

  get filterStatus() {
    return this._filterStatus;
  }

  set filterStatus(value: 'all' | 'pending' | 'delivered') {
    this._filterStatus = value;
    this.updateFilter(); // Atualiza o filtro quando muda
  }

  // --- CONTROLE DE UI (LOADING & FEEDBACK) ---
  isLoadingOrders = true; // Começa carregando
  isProcessingAction = false;
  errorMessage: string | null = null;
  successMessage: string | null = null; // Para feedbacks rápidos

  // --- CONTROLE DO OVERLAY (NOVO PEDIDO) ---
  isNewOrderOpen: boolean = false;

  // --- FORMULÁRIO DE NOVO PEDIDO ---
  cart: OrderItem[] = []; // Tipagem estrita
  customerName: string = '';
  customerPhone: string = '';
  deliveryType: 'pickup' | 'delivery' = 'pickup';
  address: string = '';
  shippingCost: number = 0;
  observations: string = '';

  // --- CONTROLE DE PAGAMENTO (MODAL FINAL) ---
  isPaymentModalOpen: boolean = false;
  selectedOrderToFinalize: Order | null = null;
  selectedPaymentMethod: PaymentMethod = PaymentMethod.DINHEIRO;

  // --- CONTROLE DE CONFIRMAÇÃO (GENERIC MODAL) ---
  isConfirmModalOpen: boolean = false;
  confirmMessage: string = '';
  confirmAction: (() => void) | null = null;

  ngOnInit() {
    console.log('OrdersComponent: ngOnInit');
    this.loadData();
  }

  loadData() {
    console.log('OrdersComponent: loadData iniciado');
    this.isLoadingOrders = true;
    this.products$ = this.productService.getProducts();

    // Inicia a stream de pedidos
    this.orders$ = this.orderService.getPendingOrders().pipe(
      catchError(err => {
        console.error('OrdersComponent: Erro ao carregar pedidos', err);
        this.errorMessage = 'Erro ao carregar pedidos. Verifique a conexão.';
        this.isLoadingOrders = false;
        return of([]);
      })
    );

    this.updateFilter();
  }

  goBack() {
    this.router.navigate(['/']);
  }

  updateFilter() {
    if (!this.orders$) return;

    this.filteredOrders$ = this.orders$.pipe(
      map(orders => {
        this.isLoadingOrders = false; // Dados chegaram

        if (!orders) return [];

        if (this._filterStatus === 'all') return orders;

        if (this._filterStatus === 'pending') {
          return orders.filter(o => o.status === 'pending');
        }

        if (this._filterStatus === 'delivered') {
          return orders.filter(o => o.status === 'delivered');
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
    this.errorMessage = null;
  }

  closeNewOrder() {
    this.isNewOrderOpen = false;
  }

  addToCart(p: Product) {
    const existingItem = this.cart.find(i => i.idProduct === p.id);

    if (existingItem) {
      existingItem.quantity++;
    } else {
      // Cria um OrderItem válido
      const newItem: OrderItem = {
        idProduct: p.id!, // Assumindo ID existe
        productName: p.title || 'Produto sem nome',
        quantity: 1,
        priceAtSale: Number(p.sellPrice) || 0,
        priceAtCost: Number(p.buyPrice) || 0
      };
      this.cart.push(newItem);
    }
  }

  removeFromCart(item: OrderItem) {
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
    this.errorMessage = null;

    // Validações Básicas
    if (!this.customerName.trim()) {
      this.showTemporaryError('Preencha o nome do cliente!');
      return;
    }
    if (this.cart.length === 0) {
      this.showTemporaryError('Adicione produtos ao pedido!');
      return;
    }

    if (this.deliveryType === 'delivery' && !this.address.trim()) {
      this.showTemporaryError('Para entrega, informe o endereço!');
      return;
    }

    this.isProcessingAction = true;

    try {
      // Monta o objeto Order (Tipagem parcial pois ID e Datas o Service/Firebase geram)
      const newOrder: Omit<Order, 'id' | 'createdAt'> = {
        customerName: this.customerName,
        customerPhone: this.customerPhone,
        items: this.cart, // Já está tipado como OrderItem[]

        itemsTotal: this.itemsTotal,
        shippingCost: Number(this.shippingCost),
        total: this.finalTotal,

        deliveryType: this.deliveryType,
        address: this.address,
        observations: this.observations,

        status: 'pending', // Service garante, mas ok explicitar
        scheduledDate: Timestamp.now() as any // placeholder se necessário pelo modelo, ou ajuste o modelo para opcional
      };

      await this.orderService.addOrder(newOrder);

      this.showTemporarySuccess('✅ Pedido Criado com Sucesso!');
      this.closeNewOrder();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      this.showTemporaryError('Erro ao criar pedido. Verifique o console.');
    } finally {
      this.isProcessingAction = false;
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

  setDeliveryType(type: 'pickup' | 'delivery') {
    this.deliveryType = type;
    if (type === 'pickup') {
      this.shippingCost = 0;
      this.address = '';
    }
  }

  // =============================================================
  // 🚀 LÓGICA DE STATUS (KANBAN / FLUXO)
  // =============================================================

  translateStatus(status: string): string {
    const map: Record<string, string> = {
      'pending': 'Pendente',
      'delivered': 'Entregue',
      'finished': 'Finalizado',
      'canceled': 'Cancelado'
    };
    return map[status] || status;
  }

  getNextActionLabel(status: string): string {
    if (status === 'pending') return 'Entregar';
    if (status === 'delivered') return 'Finalizar (Pagar)';
    return '';
  }

  // Move o fluxo
  async advanceStatus(order: Order) {
    if (!order.id) return;

    // Confirmações
    if (order.status === 'pending') {
      this.openConfirmModal(
        `Confirmar entrega do pedido de ${order.customerName}? (Isso baixará o estoque)`,
        async () => {
          this.isProcessingAction = true;
          try {
            await this.orderService.markAsDelivered(order.id!);
          } catch (err) {
            this.showTemporaryError('Erro ao atualizar status.');
          } finally {
            this.isProcessingAction = false;
            this.closeConfirmModal();
          }
        }
      );
    }
    // Entregue -> Finalizar (Pagamento)
    else if (order.status === 'delivered') {
      this.openPaymentModal(order);
    }
  }

  async cancelAction(order: Order) {
    if (!order.id) return;

    this.openConfirmModal(
      `Tem certeza que deseja CANCELAR o pedido de ${order.customerName}?`,
      async () => {
        this.isProcessingAction = true;
        try {
          await this.orderService.cancelOrder(order.id!);
          this.showTemporarySuccess('Pedido cancelado.');
        } catch (err) {
          this.showTemporaryError('Erro ao cancelar pedido.');
        } finally {
          this.isProcessingAction = false;
          this.closeConfirmModal();
        }
      }
    );
  }

  // =============================================================
  // 💰 PAGAMENTO & FINALIZAÇÃO
  // =============================================================

  openPaymentModal(order: Order) {
    this.selectedOrderToFinalize = order;
    this.selectedPaymentMethod = PaymentMethod.DINHEIRO;
    this.isPaymentModalOpen = true;
    this.errorMessage = null;
  }

  closePaymentModal() {
    this.isPaymentModalOpen = false;
    this.selectedOrderToFinalize = null;
  }

  async confirmPayment() {
    if (!this.selectedOrderToFinalize) return;

    this.isProcessingAction = true;
    try {
      await this.orderService.finalizeOrder(
        this.selectedOrderToFinalize,
        this.selectedPaymentMethod
      );

      this.showTemporarySuccess('💰 Venda Registrada e Pedido Finalizado!');
      this.closePaymentModal();

    } catch (error) {
      console.error(error);
      this.showTemporaryError('Erro ao finalizar pagamento.');
    } finally {
      this.isProcessingAction = false;
    }
  }

  // =============================================================
  // 🛠️ HELPERS UI
  // =============================================================

  trackByOrder(index: number, order: Order): string {
    return order.id || index.toString();
  }

  getOrderDate(date: any): Date | null {
    if (!date) return null;
    // Se for Timestamp do Firestore
    if (typeof date.toDate === 'function') {
      return date.toDate();
    }
    // Se já for Date ou string/number compatível
    return new Date(date);
  }

  private showTemporaryError(msg: string) {
    this.errorMessage = msg;
    setTimeout(() => this.errorMessage = null, 4000);
  }

  private showTemporarySuccess(msg: string) {
    this.successMessage = msg;
    setTimeout(() => this.successMessage = null, 3000);
  }

  // --- CONFIRMATION MODAL HELPERS ---
  openConfirmModal(message: string, action: () => void) {
    this.confirmMessage = message;
    this.confirmAction = action;
    this.isConfirmModalOpen = true;
  }

  closeConfirmModal() {
    this.isConfirmModalOpen = false;
    this.confirmMessage = '';
    this.confirmAction = null;
  }

  onConfirmYes() {
    if (this.confirmAction) {
      this.confirmAction();
    }
    // Não fecha aqui, a action fecha ou mantemos aberto se for async.
    // Mas no meu implementacao acima, eu chamo closeConfirmModal() no finally da action.
    // Então aqui só executamos.
  }

  // =============================================================
  // 👁️ DETALHES DO PEDIDO (MODAL)
  // =============================================================
  isDetailsModalOpen = false;
  selectedOrderDetails: Order | null = null;

  viewDetails(order: Order) {
    this.selectedOrderDetails = order;
    this.isDetailsModalOpen = true;
  }

  closeDetails() {
    this.isDetailsModalOpen = false;
    this.selectedOrderDetails = null;
  }
}
