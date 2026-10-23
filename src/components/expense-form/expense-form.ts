import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  DateKey,
  Expense,
  ExpenseCategory,
  ExpenseRecurrencePeriod,
  NewExpenseInput,
} from '../../models/expense-model';
import { PAYMENT_METHOD_LABELS, PaymentMethod } from '../../models/sell-model';
import { ExpenseScheduleService } from '../../services/expense-schedule-service/expense-schedule-service';
import { NotificationService } from '../../services/notification-service/notification.service';

export type ExpenseFormMode = 'unica' | 'parcelada' | 'recorrente';

export interface ExpenseFormSaveEvent {
  mode: ExpenseFormMode;
  input: NewExpenseInput;
  installments?: number;
  period?: ExpenseRecurrencePeriod;
}

interface ExpenseFormModel {
  description: string;
  value: number | null;
  categoryId: string;
  dueDate: DateKey;
  supplier: string;
  paymentMethod: PaymentMethod | '';
  notes: string;
  goodsReceivedDate: DateKey;
}

const DEFAULT_INSTALLMENTS = 2;
const MIN_INSTALLMENTS = 2;
const MAX_INSTALLMENTS = 120;
const MAX_ANCHOR_MONTHS_IN_PAST = 24;

@Component({
  selector: 'app-expense-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './expense-form.html',
  styleUrls: ['./expense-form.css', './expense-form-mobile.css'],
})
export class ExpenseFormComponent implements OnChanges {
  private notif = inject(NotificationService);

  @Input() categories: ExpenseCategory[] = [];
  @Input() expense: Expense | null = null;
  @Output() saved = new EventEmitter<ExpenseFormSaveEvent>();
  @Output() cancelled = new EventEmitter<void>();

  readonly paymentMethods = Object.values(PaymentMethod).map((valor) => ({
    value: valor,
    label: PAYMENT_METHOD_LABELS[valor],
  }));
  readonly minInstallments = MIN_INSTALLMENTS;
  readonly maxInstallments = MAX_INSTALLMENTS;
  readonly maxAnchorMonthsInPast = MAX_ANCHOR_MONTHS_IN_PAST;

  modo: ExpenseFormMode = 'unica';
  periodo: ExpenseRecurrencePeriod = 'mensal';
  parcelas = DEFAULT_INSTALLMENTS;
  novaDespesa: ExpenseFormModel = this.formularioVazio();

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['expense']) {
      return;
    }
    this.modo = 'unica';
    this.periodo = 'mensal';
    this.parcelas = DEFAULT_INSTALLMENTS;
    this.novaDespesa = this.expense ? this.formularioDe(this.expense) : this.formularioVazio();
  }

  get emEdicao(): boolean {
    return this.expense !== null;
  }

  get categoriasSelecionaveis(): ExpenseCategory[] {
    const atual = this.expense?.categoryId;
    return this.categories.filter((c) => !c.archived || c.id === atual);
  }

  get ancoraMuitoAntiga(): boolean {
    if (this.modo !== 'recorrente' || !this.novaDespesa.dueDate) {
      return false;
    }
    const hoje = ExpenseScheduleService.toDateKey(new Date());
    const limite = ExpenseScheduleService.addMonthsClamped(hoje, -MAX_ANCHOR_MONTHS_IN_PAST);
    return this.novaDespesa.dueDate < limite;
  }

  selecionarModo(modo: ExpenseFormMode): void {
    this.modo = modo;
  }

  salvar(): void {
    if (!this.formularioValido()) {
      return;
    }
    const evento: ExpenseFormSaveEvent = { mode: this.modo, input: this.montarInput() };
    if (this.modo === 'parcelada') {
      evento.installments = Number(this.parcelas);
    }
    if (this.modo === 'recorrente') {
      evento.period = this.periodo;
    }
    this.saved.emit(evento);
  }

  cancelar(): void {
    this.cancelled.emit();
  }

  private formularioValido(): boolean {
    const f = this.novaDespesa;
    if (!f.description.trim()) {
      this.notif.warning('⚠️ Informe a descrição da despesa');
      return false;
    }
    if (!(Number(f.value) > 0)) {
      this.notif.warning('⚠️ Informe um valor maior que zero');
      return false;
    }
    if (!f.categoryId) {
      this.notif.warning('⚠️ Escolha a categoria');
      return false;
    }
    if (!f.dueDate) {
      this.notif.warning('⚠️ Informe o vencimento');
      return false;
    }
    if (this.modo === 'parcelada' && !this.parcelasValidas()) {
      this.notif.warning(
        `⚠️ Parcelas devem ser um inteiro entre ${MIN_INSTALLMENTS} e ${MAX_INSTALLMENTS}`,
      );
      return false;
    }
    return true;
  }

  private parcelasValidas(): boolean {
    const n = Number(this.parcelas);
    return Number.isInteger(n) && n >= MIN_INSTALLMENTS && n <= MAX_INSTALLMENTS;
  }

  private montarInput(): NewExpenseInput {
    const f = this.novaDespesa;
    const input: NewExpenseInput = {
      description: f.description.trim(),
      value: Number(f.value),
      categoryId: f.categoryId,
      dueDate: f.dueDate,
    };
    if (f.supplier.trim()) {
      input.supplier = f.supplier.trim();
    }
    if (f.paymentMethod) {
      input.paymentMethod = f.paymentMethod;
    }
    if (f.notes.trim()) {
      input.notes = f.notes.trim();
    }
    if (f.goodsReceivedDate && this.modo === 'unica') {
      input.goodsReceivedDate = f.goodsReceivedDate;
    }
    return input;
  }

  private formularioVazio(): ExpenseFormModel {
    return {
      description: '',
      value: null,
      categoryId: '',
      dueDate: '',
      supplier: '',
      paymentMethod: '',
      notes: '',
      goodsReceivedDate: '',
    };
  }

  private formularioDe(despesa: Expense): ExpenseFormModel {
    return {
      description: despesa.description,
      value: despesa.value,
      categoryId: despesa.categoryId,
      dueDate: despesa.dueDate,
      supplier: despesa.supplier ?? '',
      paymentMethod: despesa.paymentMethod ?? '',
      notes: despesa.notes ?? '',
      goodsReceivedDate: despesa.goodsReceivedDate ?? '',
    };
  }
}
