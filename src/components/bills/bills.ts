import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Timestamp } from 'firebase/firestore';
import { Bill } from '../../models/bill-model';
import { PurchaseProduct } from '../../models/purchase-product-model';
import { BillService } from '../../services/bill-service/bill-service';
import { PurchaseProductService } from '../../services/purchase-product-service/purchase-product-service';
import { NotificationService } from '../../services/notification-service/notification.service';
import { BillRecurrenceService } from '../../services/bill-recurrence-service/bill-recurrence-service';
import { TenantService } from '../../services/tenant-service/tenant-service';

@Component({
  selector: 'app-bills',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './bills.html',
  styleUrls: ['./bills.css']
})
export class BillsComponent implements OnInit {
  bills: Bill[] = [];
  purchaseProducts: PurchaseProduct[] = [];
  filtroStatus: 'todos' | 'pendente' | 'recebido' | 'pago' = 'todos';
  exibirFormulario = false;
  isDeleteModalOpen = false;
  billToDelete: Bill | null = null;

  novaConta = {
    name: '',
    value: 0,
    dueDate: '',
    recurring: false,
    recurrencePeriod: 'mensal' as 'semanal' | 'mensal',
    purchaseProductId: ''
  };

  constructor(
    private billService: BillService,
    private purchaseProductService: PurchaseProductService,
    private notif: NotificationService,
    private billRecurrenceService: BillRecurrenceService,
    private tenantService: TenantService
  ) {}

  ngOnInit() {
    this.checkAndGenerateRecurringBills();
    this.billService.getBills().subscribe({
      next: data => {
        this.bills = data;
      },
      error: error => {
        console.error('Erro ao carregar contas:', error);
        this.notif.error('Erro ao carregar contas.');
      }
    });
    this.purchaseProductService.getPurchaseProducts().subscribe(data => {
      this.purchaseProducts = data;
    });
  }

  private async checkAndGenerateRecurringBills() {
    const companyId = this.tenantService.companyId();
    if (!companyId) return;

    try {
      await this.billRecurrenceService.checkAndGenerateDueOccurrences(companyId);
    } catch (error) {
      console.error('Erro ao gerar ocorrências de bills recorrentes:', error);
      this.notif.warning('Não foi possível verificar contas recorrentes automaticamente.');
    }
  }

  onPurchaseProductChange(productId: string) {
    if (!productId) return;
    const product = this.purchaseProducts.find(p => p.id === productId);
    if (product) {
      this.novaConta.name = product.name;
      this.novaConta.value = product.defaultValue;
      this.novaConta.recurring = product.recurring;
    }
  }

  getPurchaseProductName(id?: string): string {
    if (!id) return '';
    return this.purchaseProducts.find(p => p.id === id)?.name ?? '';
  }

  /**
   * Escopo temporal fixo (mês corrente): conta 'pendente' aparece sempre;
   * 'recebido'/'pago' só aparecem se a data em que entraram nesse status
   * (receivedAt/paidAt) cair no mês/ano atual. Filtro aplicado ANTES do
   * filtroStatus escolhido pelo usuário.
   *
   * Timestamp ausente é tratado como "dentro do escopo" (visível), nunca
   * "fora": a escrita local otimista de `updateBillStatus` chega no
   * `onSnapshot` antes do `serverTimestamp()` ser confirmado pelo servidor,
   * e nesse instante `receivedAt`/`paidAt` ainda é `null`. Se o status acabou
   * de mudar agora, a data de mudança só pode ser o mês corrente — nunca um
   * mês passado. Só sai do escopo quando o timestamp já está confirmado E
   * aponta pra um mês diferente do atual.
   */
  private dataEstaNoMesCorrente(ts?: Timestamp): boolean {
    if (!ts) return true;
    const data = (ts as any).toDate ? (ts as any).toDate() : new Date(ts as any);
    const agora = new Date();
    return data.getMonth() === agora.getMonth() && data.getFullYear() === agora.getFullYear();
  }

  private estaNoEscopoMensal(bill: Bill): boolean {
    if (bill.status === 'pendente') return true;
    if (bill.status === 'recebido') return this.dataEstaNoMesCorrente(bill.receivedAt);
    return this.dataEstaNoMesCorrente(bill.paidAt);
  }

  get billsNoEscopoMensal(): Bill[] {
    return this.bills.filter(b => this.estaNoEscopoMensal(b));
  }

  get billsFiltradas(): Bill[] {
    if (this.filtroStatus === 'todos') return this.billsNoEscopoMensal;
    return this.billsNoEscopoMensal.filter(b => b.status === this.filtroStatus);
  }

  get totalPendente(): number {
    return this.billsNoEscopoMensal
      .filter(b => b.status === 'pendente')
      .reduce((s, b) => s + b.value, 0);
  }

  get totalRecebido(): number {
    return this.billsNoEscopoMensal
      .filter(b => b.status === 'recebido')
      .reduce((s, b) => s + b.value, 0);
  }

  get totalPago(): number {
    return this.billsNoEscopoMensal
      .filter(b => b.status === 'pago')
      .reduce((s, b) => s + b.value, 0);
  }

  countByStatus(status: Bill['status']): number {
    return this.billsNoEscopoMensal.filter(b => b.status === status).length;
  }

  async avancarStatus(bill: Bill) {
    if (!bill.id || bill.status === 'pago') return;
    const next: Bill['status'] = bill.status === 'pendente' ? 'recebido' : 'pago';
    try {
      await this.billService.updateBillStatus(bill.id, next);
    } catch (error) {
      console.error('Erro ao atualizar status da conta:', error);
      this.notif.error('Erro ao atualizar status.');
    }
  }

  abrirFormulario() {
    this.novaConta = { name: '', value: 0, dueDate: '', recurring: false, recurrencePeriod: 'mensal', purchaseProductId: '' };
    this.exibirFormulario = true;
  }

  fecharFormulario() {
    this.exibirFormulario = false;
  }

  async salvarConta() {
    if (!this.novaConta.name.trim() || this.novaConta.value <= 0) {
      this.notif.warning('Preencha nome e valor.');
      return;
    }
    const data: Omit<Bill, 'id' | 'createdAt' | 'companyId'> = {
      name: this.novaConta.name.trim(),
      value: Number(this.novaConta.value),
      status: 'pendente',
      recurring: this.novaConta.recurring,
    };
    if (this.novaConta.recurring) {
      data.recurrencePeriod = this.novaConta.recurrencePeriod;
    }
    if (this.novaConta.dueDate) {
      data.dueDate = Timestamp.fromDate(new Date(this.novaConta.dueDate + 'T00:00:00')) as any;
    }
    if (this.novaConta.purchaseProductId) {
      data.purchaseProductId = this.novaConta.purchaseProductId;
    }
    try {
      await this.billService.addBill(data);
      this.notif.success('Conta cadastrada!');
      this.fecharFormulario();
      this.filtroStatus = 'todos';
    } catch (error) {
      console.error('Erro ao salvar conta:', error);
      this.notif.error('Erro ao salvar conta.');
    }
  }

  openDeleteModal(bill: Bill) {
    this.billToDelete = bill;
    this.isDeleteModalOpen = true;
  }

  closeDeleteModal() {
    this.isDeleteModalOpen = false;
    this.billToDelete = null;
  }

  async confirmDelete() {
    if (!this.billToDelete?.id) return;
    try {
      await this.billService.deleteBill(this.billToDelete.id);
      this.notif.success('Conta excluída!');
      this.closeDeleteModal();
    } catch (error) {
      console.error('Erro ao excluir conta:', error);
      this.notif.error('Erro ao excluir conta.');
    }
  }

  statusLabel(status: Bill['status']): string {
    const labels: Record<Bill['status'], string> = {
      pendente: 'Pendente',
      recebido: 'Recebido',
      pago: 'Pago'
    };
    return labels[status];
  }

  formatDate(ts: any): string {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('pt-BR');
  }
}
