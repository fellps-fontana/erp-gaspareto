import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Observable, of, Subscription } from 'rxjs';
import { Customer } from '../../models/customer-model';
import { Order } from '../../models/order-model';
import { CustomerService } from '../../services/customer-service/customer-service';
import { OrderService } from '../../services/order-service/order-service';
import { NotificationService } from '../../services/notification-service/notification.service';

interface CustomerForm {
  name: string;
  phone: string;
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
}

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './customers.html',
  styleUrls: ['./customers.css']
})
export class CustomersComponent implements OnInit, OnDestroy {
  private customerService = inject(CustomerService);
  private orderService = inject(OrderService);
  private notif = inject(NotificationService);
  private router = inject(Router);

  customers: Customer[] = [];
  searchTerm = '';
  isFormOpen = false;
  isDeleteModalOpen = false;
  isProcessing = false;
  cepLoading = false;
  cepError = '';

  form: CustomerForm = this.emptyForm();
  editingId: string | null = null;
  customerToDelete: Customer | null = null;

  isHistoryModalOpen = false;
  selectedCustomerForHistory: Customer | null = null;
  customerOrders$: Observable<Order[]> = of([]);

  private sub?: Subscription;

  get filteredCustomers(): Customer[] {
    if (!this.searchTerm.trim()) return this.customers;
    const term = this.searchTerm.toLowerCase();
    return this.customers.filter(c =>
      c.name.toLowerCase().includes(term) ||
      (c.phone && c.phone.includes(term)) ||
      (c.address && c.address.toLowerCase().includes(term))
    );
  }

  get formattedAddress(): string {
    const { rua, numero, complemento, bairro, cidade, uf } = this.form;
    if (!rua || !numero.trim() || !bairro || !cidade) return '';
    const num = complemento.trim()
      ? `${numero.trim()}, ${complemento.trim()}`
      : numero.trim();
    return `${rua}, ${num}, ${bairro}, ${cidade} - ${uf}`;
  }

  get addressReady(): boolean {
    return !!this.form.rua && !!this.form.numero.trim() && !!this.form.bairro && !!this.form.cidade;
  }

  ngOnInit() {
    this.sub = this.customerService.getCustomers().subscribe({
      next: customers => this.customers = customers,
      error: () => this.notif.error('Erro ao carregar clientes.')
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  goBack() {
    this.router.navigate(['/']);
  }

  openAdd() {
    this.form = this.emptyForm();
    this.editingId = null;
    this.cepError = '';
    this.isFormOpen = true;
  }

  openEdit(c: Customer) {
    this.form = this.emptyForm();
    this.form.name        = c.name;
    this.form.phone       = c.phone       ?? '';
    this.form.cep         = c.cep         ?? '';
    this.form.rua         = c.rua         ?? c.address ?? '';
    this.form.numero      = c.numero      ?? '';
    this.form.complemento = c.complemento ?? '';
    this.form.bairro      = c.bairro      ?? '';
    this.form.cidade      = c.cidade      ?? '';
    this.form.uf          = c.uf          ?? '';
    this.editingId = c.id!;
    this.cepError  = '';
    this.isFormOpen = true;
  }

  closeForm() {
    this.isFormOpen = false;
    this.editingId = null;
  }

  onCepInput() {
    const digits = this.form.cep.replace(/\D/g, '');
    if (digits.length > 8) {
      this.form.cep = this.form.cep.slice(0, 9);
      return;
    }
    this.form.cep = digits.length > 5
      ? `${digits.slice(0, 5)}-${digits.slice(5)}`
      : digits;

    this.cepError = '';
    if (digits.length === 8) {
      this.fetchCep(digits);
    } else {
      this.clearAddressFields();
    }
  }

  private async fetchCep(cep: string) {
    this.cepLoading = true;
    this.clearAddressFields();
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) {
        this.cepError = 'CEP não encontrado.';
        return;
      }
      this.form.rua    = data.logradouro || '';
      this.form.bairro = data.bairro     || '';
      this.form.cidade = data.localidade || '';
      this.form.uf     = data.uf         || '';
    } catch {
      this.cepError = 'Erro ao buscar CEP. Tente novamente.';
    } finally {
      this.cepLoading = false;
    }
  }

  private clearAddressFields() {
    this.form.rua    = '';
    this.form.bairro = '';
    this.form.cidade = '';
    this.form.uf     = '';
    this.form.numero = '';
    this.form.complemento = '';
  }

  async save() {
    if (!this.form.name.trim()) {
      this.notif.warning('Informe o nome do cliente.');
      return;
    }
    const address = this.formattedAddress;
    this.isProcessing = true;
    try {
      const data: Omit<Customer, 'id'> = {
        name:        this.form.name.trim(),
        phone:       this.form.phone?.trim() ?? '',
        address:     address || '',
        cep:         this.form.cep,
        rua:         this.form.rua,
        numero:      this.form.numero,
        complemento: this.form.complemento,
        bairro:      this.form.bairro,
        cidade:      this.form.cidade,
        uf:          this.form.uf,
      };
      if (this.editingId) {
        await this.customerService.updateCustomer(this.editingId, data);
        this.notif.success('Cliente atualizado!');
      } else {
        await this.customerService.addCustomer(data);
        this.notif.success('Cliente cadastrado!');
      }
      this.closeForm();
    } catch {
      this.notif.error('Erro ao salvar cliente.');
    } finally {
      this.isProcessing = false;
    }
  }

  openDelete(c: Customer) {
    this.customerToDelete = c;
    this.isDeleteModalOpen = true;
  }

  closeDelete() {
    this.isDeleteModalOpen = false;
    this.customerToDelete = null;
  }

  async confirmDelete() {
    if (!this.customerToDelete?.id) return;
    this.isProcessing = true;
    try {
      await this.customerService.deleteCustomer(this.customerToDelete.id);
      this.notif.success('Cliente removido.');
      this.closeDelete();
    } catch {
      this.notif.error('Erro ao remover cliente.');
    } finally {
      this.isProcessing = false;
    }
  }

  openMaps(c: Customer) {
    if (!c.address) return;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(c.address)}`, '_blank');
  }

  openHistory(c: Customer) {
    this.selectedCustomerForHistory = c;
    this.customerOrders$ = this.orderService.getOrdersByCustomer(c.id!);
    this.isHistoryModalOpen = true;
  }

  closeHistory() {
    this.isHistoryModalOpen = false;
    this.selectedCustomerForHistory = null;
    this.customerOrders$ = of([]);
  }

  translateOrderStatus(status: string): string {
    const map: Record<string, string> = {
      open: 'Aberto', pending: 'Pendente', preparing: 'Preparando',
      ready: 'Pronto', delivering: 'Em Entrega', delivered: 'Entregue',
      finished: 'Finalizado', canceled: 'Cancelado'
    };
    return map[status] || status;
  }

  deliveryTypeLabel(type: 'pickup' | 'delivery'): string {
    return type === 'delivery' ? 'Entrega' : 'Retirada';
  }

  getOrderDate(date: any): Date | null {
    if (!date) return null;
    if (typeof date.toDate === 'function') return date.toDate();
    return new Date(date);
  }

  trackByOrderId(_: number, order: Order): string {
    return order.id || _.toString();
  }

  private emptyForm(): CustomerForm {
    return { name: '', phone: '', cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' };
  }
}
