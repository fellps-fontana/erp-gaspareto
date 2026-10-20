import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { OrderPayment } from '../../models/order-model';
import { PAYMENT_METHOD_LABELS, PaymentMethod } from '../../models/sell-model';
import { NotificationService } from '../../services/notification-service/notification.service';
import {
  PagamentoInvalidoError,
  ParcelaInput,
  ResumoAgenda,
  gerarParcelasIguais,
  resumirAgenda
} from '../../services/order-service/order-payment-rules';

interface ParcelaRow {
  amount: number | null;
  dueDate: string; // yyyy-MM-dd
  method: PaymentMethod;
}

/**
 * Modal "Montar parcelas" (regra-de-negocio.md seção 5.3): parcelas iguais ou
 * lançamento livre. Soma x saldo vem de resumirAgenda; a divisão, de
 * gerarParcelasIguais. Só emite ParcelaInput[] — quem persiste é o pai.
 */
@Component({
  selector: 'app-order-installments',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './order-installments.html',
  styleUrls: ['./order-installments.css']
})
export class OrderInstallmentsComponent implements OnInit {
  private notif = inject(NotificationService);

  /** Saldo que as parcelas precisam fechar. */
  @Input() saldoAlvo = 0;
  /** Parcelas previstas atuais; se houver, o modal abre no modo livre com elas carregadas. */
  @Input() parcelasIniciais: readonly OrderPayment[] = [];
  /** Reajuste da edição de itens: o botão salva parcelas e pedido juntos (o pai grava). */
  @Input() reajuste = false;
  @Input() processing = false;

  @Output() saved = new EventEmitter<ParcelaInput[]>();
  @Output() closed = new EventEmitter<void>();

  mode: 'iguais' | 'livre' = 'iguais';
  rows: ParcelaRow[] = [];
  equalCount = 2;
  equalFirstDate = '';
  equalMethod: PaymentMethod = PaymentMethod.BOLETO;

  // Cartão e Misto nunca são forma de parcela prevista.
  readonly methodOptions: { value: PaymentMethod; label: string }[] = [
    PaymentMethod.DINHEIRO, PaymentMethod.PIX, PaymentMethod.CHEQUE, PaymentMethod.BOLETO
  ].map(value => ({ value, label: PAYMENT_METHOD_LABELS[value] }));

  ngOnInit(): void {
    this.equalFirstDate = this.toDateInputValue(new Date());
    this.rows = this.parcelasIniciais.map(p => ({
      amount: p.amount,
      dueDate: p.dueDate ? this.toDateInputValue(p.dueDate) : '',
      method: p.method
    }));
    this.mode = this.rows.length > 0 ? 'livre' : 'iguais';
  }

  get resumo(): ResumoAgenda {
    return resumirAgenda(this.saldoAlvo, this.rows.map(r => ({ amount: Number(r.amount) || 0 })));
  }

  get canSave(): boolean {
    const semParcelas = this.rows.length === 0 && this.saldoAlvo === 0;
    const datasPreenchidas = this.rows.every(r => !!r.dueDate);
    return (semParcelas || this.resumo.fecha) && datasPreenchidas;
  }

  setMode(mode: 'iguais' | 'livre') { this.mode = mode; }

  /** Prévia editável: a divisão (centavos na última, meses ancorados) vem de gerarParcelasIguais. */
  generateEqual() {
    if (!this.equalFirstDate) {
      this.notif.warning('Informe a data da primeira parcela.');
      return;
    }
    try {
      const geradas = gerarParcelasIguais(
        this.saldoAlvo,
        Math.floor(Number(this.equalCount)),
        new Date(`${this.equalFirstDate}T12:00:00`),
        this.equalMethod
      );
      this.rows = geradas.map(p => ({
        amount: p.amount,
        dueDate: this.toDateInputValue(p.dueDate),
        method: p.method
      }));
    } catch (error) {
      this.notif.warning(error instanceof PagamentoInvalidoError
        ? 'Informe uma quantidade de parcelas válida.'
        : 'Não foi possível gerar as parcelas.');
    }
  }

  addRow() { this.rows.push({ amount: null, dueDate: '', method: PaymentMethod.BOLETO }); }

  removeRow(index: number) { this.rows.splice(index, 1); }

  save() {
    if (!this.canSave) return;
    this.saved.emit(this.rows.map(r => ({
      amount: Number(r.amount),
      dueDate: new Date(`${r.dueDate}T12:00:00`),
      method: r.method
    })));
  }

  /** Date ou Timestamp do Firestore -> yyyy-MM-dd local, para o <input type="date">. */
  private toDateInputValue(date: Date | { toDate(): Date }): string {
    const d = date instanceof Date ? date : date.toDate();
    return d.toLocaleDateString('sv-SE');
  }
}
