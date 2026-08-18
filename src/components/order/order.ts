import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, map, catchError, of, Subscription } from 'rxjs';

import { Product } from '../../models/product-model';
import { Order, OrderItem } from '../../models/order-model';
import { Customer } from '../../models/customer-model';
import { PaymentMethod } from '../../models/sell-model';
import { ProductService } from '../../services/product-service/product-service';
import { OrderService } from '../../services/order-service/order-service';
import { CustomerService } from '../../services/customer-service/customer-service';
import { NotificationService } from '../../services/notification-service/notification.service';
import { Timestamp } from 'firebase/firestore';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './order.html',
  styleUrls: ['./order.css', './order_mobile.css', './order_details.css']
})
export class OrdersComponent implements OnInit, OnDestroy {
  private productService  = inject(ProductService);
  private orderService    = inject(OrderService);
  private customerService = inject(CustomerService);
  private router          = inject(Router);
  private notif           = inject(NotificationService);

  // ── STREAMS ──────────────────────────────────────────────────────
  products$!: Observable<Product[]>;
  orders$!: Observable<Order[]>;
  filteredOrders$!: Observable<Order[]>;
  orderSummary$!: Observable<{ productName: string; totalQuantity: number }[]>;

  // ── FILTROS ───────────────────────────────────────────────────────
  private _filterStatus: 'all' | 'pending' | 'delivered' = 'all';

  get filterStatus() { return this._filterStatus; }
  set filterStatus(v: 'all' | 'pending' | 'delivered') { this._filterStatus = v; this.updateFilter(); }

  // ── ORDENAÇÃO ─────────────────────────────────────────────────────
  private _sortOrder: 'recent' | 'oldest' = 'recent';

  get sortOrder() { return this._sortOrder; }
  set sortOrder(v: 'recent' | 'oldest') { this._sortOrder = v; this.updateFilter(); }

  // ── UI ────────────────────────────────────────────────────────────
  isLoadingOrders = true;
  isProcessingAction = false;

  // ── NOVO PEDIDO ───────────────────────────────────────────────────
  isNewOrderOpen = false;
  cart: OrderItem[] = [];
  customerName  = '';
  customerPhone = '';
  deliveryType: 'pickup' | 'delivery' = 'pickup';
  address       = '';
  shippingCost  = 0;
  observations  = '';
  scheduledDate = ''; // Data de entrega prevista (formato yyyy-MM-dd, do <input type="date">)

  // ── BUSCA DE CLIENTE ──────────────────────────────────────────────
  customerSearch       = '';
  showCustomerDropdown = false;
  selectedCustomerId: string | null = null;
  addressLat?: number;
  addressLng?: number;

  private selectedCustomerAddress = '';
  private selectedCustomerLat?: number;
  private selectedCustomerLng?: number;

  private allCustomers: Customer[] = [];
  private customerSub?: Subscription;

  get matchingCustomers(): Customer[] {
    const term = this.customerSearch.trim().toLowerCase();
    if (!term || term.length < 1) return [];
    return this.allCustomers
      .filter(c =>
        c.name.toLowerCase().includes(term) ||
        (c.phone && c.phone.includes(term))
      )
      .slice(0, 6);
  }

  // ── PAGAMENTO ─────────────────────────────────────────────────────
  isPaymentModalOpen       = false;
  selectedOrderToFinalize: Order | null = null;
  private _selectedPaymentMethod: PaymentMethod = PaymentMethod.DINHEIRO;
  selectedInstallments: number = 1;

  get selectedPaymentMethod(): PaymentMethod {
    return this._selectedPaymentMethod;
  }

  set selectedPaymentMethod(value: PaymentMethod) {
    this._selectedPaymentMethod = value;
    // Reset installments to 1 when switching to PIX (always à vista)
    if (value === PaymentMethod.PIX) {
      this.selectedInstallments = 1;
    }
  }

  get requiresInstallments(): boolean {
    return this._selectedPaymentMethod !== PaymentMethod.PIX;
  }

  // ── EDIÇÃO ────────────────────────────────────────────────────────
  editingOrderId: string | null = null;

  // ── CONFIRMAÇÃO GENÉRICA ──────────────────────────────────────────
  isConfirmModalOpen = false;
  confirmMessage     = '';
  confirmAction: (() => void) | null = null;

  // ── DETALHES ──────────────────────────────────────────────────────
  isDetailsModalOpen   = false;
  selectedOrderDetails: Order | null = null;

  // =================================================================
  ngOnInit() {
    this.loadData();
    this.customerSub = this.customerService.getCustomers().subscribe(
      customers => this.allCustomers = customers
    );
  }

  ngOnDestroy() {
    this.customerSub?.unsubscribe();
  }

  loadData() {
    this.isLoadingOrders = true;
    this.products$ = this.productService.getProducts();

    this.orders$ = this.orderService.getOrders().pipe(
      catchError(err => {
        console.error('OrdersComponent: Erro ao carregar pedidos', err);
        this.notif.error('Erro ao carregar pedidos. Verifique a conexão.');
        this.isLoadingOrders = false;
        return of([]);
      })
    );

    this.updateFilter();
  }

  goBack() { this.router.navigate(['/']); }

  updateFilter() {
    if (!this.orders$) return;

    this.filteredOrders$ = this.orders$.pipe(
      map(orders => {
        this.isLoadingOrders = false;
        if (!orders) return [];

        // Pedidos finalizados/cancelados não aparecem mais nesta tela (nem
        // no filtro "Todos") — a tela de Pedidos é só operacional agora.
        // Esse histórico vive na aba Histórico Geral (Gestão), que já cobre
        // os 3 status por lá (Pedido, PDV, Comanda) sem duplicar aqui.
        let result = orders.filter(o => !['finished', 'canceled'].includes(o.status));

        if (this._filterStatus === 'pending') {
          result = result.filter(o =>
            ['open', 'pending', 'preparing', 'ready', 'delivering'].includes(o.status)
          );
        } else if (this._filterStatus === 'delivered') {
          result = result.filter(o => o.status === 'delivered');
        }

        if (this._sortOrder === 'oldest') {
          result = [...result].sort(
            (a, b) => this.getTimestampMillis(a.createdAt) - this.getTimestampMillis(b.createdAt)
          );
        }

        return result;
      })
    );

    this.orderSummary$ = this.filteredOrders$.pipe(
      map(orders => {
        const map: Record<string, number> = {};
        orders.forEach(o => o.items.forEach(i => {
          map[i.productName] = (map[i.productName] || 0) + i.quantity;
        }));
        return Object.entries(map)
          .map(([productName, totalQuantity]) => ({ productName, totalQuantity }))
          .sort((a, b) => b.totalQuantity - a.totalQuantity);
      })
    );
  }

  // =================================================================
  // BUSCA DE CLIENTE
  // =================================================================

  onCustomerSearchInput() {
    this.selectedCustomerId = null;
    this.showCustomerDropdown = this.customerSearch.trim().length > 0;
  }

  selectCustomer(c: Customer) {
    this.selectedCustomerId = c.id!;
    this.customerSearch     = c.name;
    this.customerName       = c.name;
    this.customerPhone      = c.phone ?? '';
    this.showCustomerDropdown = false;

    this.selectedCustomerAddress = c.address ?? '';
    this.selectedCustomerLat     = c.lat;
    this.selectedCustomerLng     = c.lng;

    if (this.deliveryType === 'delivery' && this.selectedCustomerAddress) {
      this.address    = this.selectedCustomerAddress;
      this.addressLat = this.selectedCustomerLat;
      this.addressLng = this.selectedCustomerLng;
    }
  }

  hideDropdownDelayed() {
    setTimeout(() => { this.showCustomerDropdown = false; }, 200);
  }

  clearCustomer() {
    this.selectedCustomerId      = null;
    this.customerSearch          = '';
    this.customerName            = '';
    this.customerPhone           = '';
    this.selectedCustomerAddress = '';
    this.selectedCustomerLat     = undefined;
    this.selectedCustomerLng     = undefined;
    if (this.deliveryType === 'delivery') {
      this.address    = '';
      this.addressLat = undefined;
      this.addressLng = undefined;
    }
  }

  // =================================================================
  // CARRINHO
  // =================================================================

  openNewOrder() { this.clearForm(); this.isNewOrderOpen = true; }

  editOrder(order: Order) {
    if (order.status !== 'pending' && order.status !== 'open') {
      this.notif.warning('Apenas pedidos pendentes podem ser editados.');
      return;
    }
    this.clearForm();
    this.editingOrderId       = order.id ?? null;
    this.customerSearch       = order.customerName;
    this.customerName         = order.customerName;
    this.customerPhone        = order.customerPhone ?? '';
    this.selectedCustomerId   = order.customerId ?? null;
    this.deliveryType         = order.deliveryType;
    this.address              = order.address ?? '';
    this.addressLat           = order.addressLat;
    this.addressLng           = order.addressLng;
    this.shippingCost         = order.shippingCost ?? 0;
    this.observations         = order.observations ?? '';
    this.scheduledDate        = this.toDateInputValue(order.scheduledDate);
    this.cart                 = [...order.items];
    this.isNewOrderOpen       = true;
  }

  closeNewOrder() { this.isNewOrderOpen = false; this.clearForm(); }

  addToCart(p: Product) {
    const existing = this.cart.find(i => i.idProduct === p.id);
    if (existing) {
      existing.quantity++;
    } else {
      this.cart.push({
        idProduct:   p.id!,
        productName: p.title || 'Produto sem nome',
        quantity:    1,
        priceAtSale: Number(p.sellPrice) || 0,
        priceAtCost: Number(p.buyPrice)  || 0
      });
    }
  }

  removeFromCart(item: OrderItem) {
    const idx = this.cart.indexOf(item);
    if (idx > -1) this.cart.splice(idx, 1);
  }

  /** Edição direta da quantidade já no carrinho — não altera o clique de adicionar na grade de produtos. */
  increaseQuantity(item: OrderItem) {
    item.quantity++;
  }

  decreaseQuantity(item: OrderItem) {
    if (item.quantity > 1) {
      item.quantity--;
    } else {
      this.removeFromCart(item);
    }
  }

  /** Handler do input numérico da linha do carrinho: normaliza e remove a linha se cair abaixo de 1. */
  onQuantityInputChange(item: OrderItem, value: number | string) {
    const qty = Math.floor(Number(value));
    if (!qty || qty < 1) {
      this.removeFromCart(item);
      return;
    }
    item.quantity = qty;
  }

  get itemsTotal(): number {
    return this.cart.reduce((acc, i) => acc + i.priceAtSale * i.quantity, 0);
  }

  get finalTotal(): number {
    return this.itemsTotal + Number(this.shippingCost);
  }

  async saveOrder() {
    if (!this.selectedCustomerId) {
      this.notif.warning('Selecione um cliente cadastrado para criar o pedido!');
      return;
    }
    if (this.cart.length === 0) {
      this.notif.warning('Adicione produtos ao pedido!');
      return;
    }
    if (this.deliveryType === 'delivery' && !this.address.trim()) {
      this.notif.warning('Para entrega, informe o endereço!');
      return;
    }

    this.isProcessingAction = true;
    try {
      const orderData: any = {
        customerName:  this.customerName.trim(),
        customerPhone: this.customerPhone.trim(),
        items:         this.cart,
        itemsTotal:    this.itemsTotal,
        shippingCost:  Number(this.shippingCost),
        total:         this.finalTotal,
        deliveryType:  this.deliveryType,
        address:       this.address.trim(),
        observations:  this.observations,
        ...(this.scheduledDate
          ? { scheduledDate: Timestamp.fromDate(new Date(`${this.scheduledDate}T00:00:00`)) }
          : {}),
        ...(this.selectedCustomerId ? { customerId: this.selectedCustomerId } : {}),
        ...(this.addressLat != null ? { addressLat: this.addressLat } : {}),
        ...(this.addressLng != null ? { addressLng: this.addressLng } : {})
      };

      if (this.editingOrderId) {
        await this.orderService.updateOrder(this.editingOrderId, orderData);
        this.notif.success('✅ Pedido Atualizado com Sucesso!');
      } else {
        orderData.status = 'pending';
        await this.orderService.addOrder(orderData);
        this.notif.success('✅ Pedido Criado com Sucesso!');
      }
      this.closeNewOrder();
    } catch (error) {
      console.error('Erro ao salvar pedido:', error);
      this.notif.error('Erro ao salvar pedido. Verifique o console.');
    } finally {
      this.isProcessingAction = false;
    }
  }

  clearForm() {
    this.cart                 = [];
    this.customerSearch       = '';
    this.customerName         = '';
    this.customerPhone        = '';
    this.selectedCustomerId   = null;
    this.showCustomerDropdown = false;
    this.address                 = '';
    this.addressLat              = undefined;
    this.addressLng              = undefined;
    this.selectedCustomerAddress = '';
    this.selectedCustomerLat     = undefined;
    this.selectedCustomerLng     = undefined;
    this.shippingCost            = 0;
    this.deliveryType         = 'pickup';
    this.observations         = '';
    this.scheduledDate        = '';
    this.editingOrderId       = null;
  }

  setDeliveryType(type: 'pickup' | 'delivery') {
    this.deliveryType = type;
    if (type === 'pickup') {
      this.shippingCost = 0;
      this.address      = '';
      this.addressLat   = undefined;
      this.addressLng   = undefined;
    } else if (type === 'delivery' && this.selectedCustomerAddress) {
      this.address    = this.selectedCustomerAddress;
      this.addressLat = this.selectedCustomerLat;
      this.addressLng = this.selectedCustomerLng;
    }
  }

  // =================================================================
  // CALENDÁRIO (Google Calendar)
  // =================================================================

  /** Converte um Timestamp/Date do Firestore para o formato yyyy-MM-dd usado pelo <input type="date">. */
  private toDateInputValue(date: any): string {
    const d = this.getOrderDate(date);
    if (!d) return '';
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /** Rótulo do campo de data: muda conforme o tipo de logística escolhido. */
  get scheduleDateLabel(): string {
    return this.deliveryType === 'pickup' ? 'Data de Retirada:' : 'Data de Entrega:';
  }

  /** true quando já dá pra montar o evento (precisa de cliente selecionado + data marcada). */
  get canAddToCalendar(): boolean {
    return !!this.scheduledDate && !!this.customerName.trim();
  }

  /** Abre o Google Calendar em uma nova aba com o evento de entrega já preenchido — só clicar em Salvar. */
  openAddToCalendar() {
    if (!this.scheduledDate) {
      this.notif.warning('Defina a data de entrega antes de adicionar ao calendário.');
      return;
    }

    const start = this.scheduledDate.replace(/-/g, '');
    const endDate = new Date(`${this.scheduledDate}T00:00:00`);
    endDate.setDate(endDate.getDate() + 1);
    const end = `${endDate.getFullYear()}${String(endDate.getMonth() + 1).padStart(2, '0')}${String(endDate.getDate()).padStart(2, '0')}`;

    const title = `${this.deliveryType === 'pickup' ? 'Retirada' : 'Entrega'} - ${this.customerName || 'Pedido'}`;

    const itemsDescription = this.cart.length
      ? this.cart.map(i => `${i.quantity}x ${i.productName}`).join(', ')
      : '';
    const detailsParts = [
      itemsDescription ? `Itens: ${itemsDescription}` : '',
      this.customerPhone ? `Telefone: ${this.customerPhone}` : '',
      this.observations ? `Obs: ${this.observations}` : ''
    ].filter(Boolean);

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      dates: `${start}/${end}`,
      details: detailsParts.join('\n')
    });

    if (this.deliveryType === 'delivery' && this.address.trim()) {
      params.set('location', this.address.trim());
    }

    window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, '_blank');
  }

  // =================================================================
  // MAPS
  // =================================================================

  openMapsAddress(address: string) {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`, '_blank');
  }

  // =================================================================
  // WHATSAPP
  // =================================================================

  openWhatsApp(phone: string) {
    if (!phone) return;
    const digits = phone.replace(/\D/g, '');
    if (!digits) return;
    const withCountryCode = digits.length <= 11 ? `55${digits}` : digits;
    window.open(`https://wa.me/${withCountryCode}`, '_blank');
  }

  // =================================================================
  // STATUS / FLUXO
  // =================================================================

  translateStatus(status: string): string {
    const map: Record<string, string> = {
      open: 'Aberto', pending: 'Pendente', preparing: 'Preparando',
      ready: 'Pronto', delivering: 'Em Entrega', delivered: 'Entregue',
      finished: 'Finalizado', canceled: 'Cancelado'
    };
    return map[status] || status;
  }

  getNextActionLabel(status: string): string {
    if (status === 'open' || status === 'pending') return 'Entregar';
    if (status === 'delivering') return 'Entregue';
    if (status === 'delivered') return 'Pagar';
    return '';
  }

  async advanceStatus(order: Order) {
    if (!order.id) return;
    this.isProcessingAction = true;
    try {
      if (['open', 'pending', 'delivering'].includes(order.status)) {
        this.openConfirmModal(
          `Confirmar entrega do pedido de ${order.customerName}? (O estoque será baixado)`,
          async () => {
            this.isProcessingAction = true;
            try {
              await this.orderService.markAsDelivered(order.id!);
              this.notif.success('Pedido marcado como Entregue! ✅');
            } catch (err: any) {
              this.notif.error(err?.message || 'Erro ao registrar entrega.');
            } finally {
              this.isProcessingAction = false;
              this.closeConfirmModal();
            }
          }
        );
      } else if (order.status === 'delivered') {
        this.openPaymentModal(order);
      }
    } catch (err) {
      console.error(err);
      this.notif.error('Erro ao atualizar status do pedido.');
    } finally {
      this.isProcessingAction = false;
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
          this.notif.success('Pedido cancelado.');
        } catch {
          this.notif.error('Erro ao cancelar pedido.');
        } finally {
          this.isProcessingAction = false;
          this.closeConfirmModal();
        }
      }
    );
  }

  // =================================================================
  // PAGAMENTO
  // =================================================================

  openPaymentModal(order: Order) {
    this.selectedOrderToFinalize  = order;
    this.selectedPaymentMethod    = PaymentMethod.DINHEIRO;
    this.isPaymentModalOpen       = true;
  }

  closePaymentModal() { this.isPaymentModalOpen = false; this.selectedOrderToFinalize = null; }

  async confirmPayment() {
    if (!this.selectedOrderToFinalize) return;
    this.isProcessingAction = true;
    try {
      await this.orderService.finalizeOrder(this.selectedOrderToFinalize, this.selectedPaymentMethod, this.selectedInstallments);
      this.notif.success('💰 Venda Registrada e Pedido Finalizado!');
      this.closePaymentModal();
    } catch (error) {
      console.error(error);
      this.notif.error('Erro ao finalizar pagamento.');
    } finally {
      this.isProcessingAction = false;
    }
  }

  // =================================================================
  // HELPERS UI
  // =================================================================

  trackByOrder(_: number, order: Order): string {
    return order.id || _.toString();
  }

  getOrderDate(date: any): Date | null {
    if (!date) return null;
    if (typeof date.toDate === 'function') return date.toDate();
    return new Date(date);
  }

  private getTimestampMillis(date: any): number {
    return date?.toMillis?.() || (date as any)?.seconds * 1000 || 0;
  }

  openConfirmModal(message: string, action: () => void) {
    this.confirmMessage = message;
    this.confirmAction  = action;
    this.isConfirmModalOpen = true;
  }

  closeConfirmModal() {
    this.isConfirmModalOpen = false;
    this.confirmMessage     = '';
    this.confirmAction      = null;
  }

  onConfirmYes() {
    this.confirmAction?.();
  }

  viewDetails(order: Order) {
    this.selectedOrderDetails = order;
    this.isDetailsModalOpen   = true;
  }

  closeDetails() {
    this.isDetailsModalOpen   = false;
    this.selectedOrderDetails = null;
  }
}
