import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Order } from '../../models/order-model';
import {
  RecurrenceFrequency, RecurringOrder, RecurringOrderItem
} from '../../models/recurring-order-model';
import { NotificationService } from '../../services/notification-service/notification.service';
import { validarPeso } from '../../services/product-service/product-weight-rules';
import { AlteracaoDoModelo } from '../../services/recurring-order-service/recurring-order-build-rules';
import {
  AgendaDeRecorrencia, hojeCivil, validarAgenda
} from '../../services/recurring-order-service/recurrence-rules';
import { notificarErroDeRecorrencia } from './recurrence-errors';
import { DIAS_DA_SEMANA, OPCOES_DE_FREQUENCIA } from './recurrence-labels';
import { dataCivilDoPedido, primeiraDataSugerida } from './order-recurrence-form';

const MENSAGEM_FRETE_INVALIDO = 'O frete não pode ser negativo.';
const MENSAGEM_SEM_ITENS = 'O pedido recorrente precisa ter ao menos um item.';
const MENSAGEM_QUANTIDADE_INVALIDA = 'A quantidade de cada item deve ser um número inteiro maior que zero.';

/**
 * Modal de recorrencia (regra-de-negocio.md secao 5.4), em dois modos:
 * criar ("Repetir pedido", recebe `order`) e editar (recebe `model`). So coleta e emite;
 * a validacao da agenda e a sugestao de data vem de recurrence-rules; quem persiste e o pai.
 */
@Component({
  selector: 'app-order-recurrence',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './order-recurrence.html',
  styleUrls: ['./order-recurrence.css']
})
export class OrderRecurrenceComponent implements OnInit {
  private notif = inject(NotificationService);

  /** Modo criar: pedido de origem. */
  @Input() order?: Order;
  /** Modo editar: modelo existente (ativo ou pausado). */
  @Input() model?: RecurringOrder;
  @Input() processing = false;

  @Output() saved = new EventEmitter<AgendaDeRecorrencia>();
  @Output() edited = new EventEmitter<AlteracaoDoModelo>();
  @Output() closed = new EventEmitter<void>();

  readonly frequencias = OPCOES_DE_FREQUENCIA;
  readonly diasDaSemana = DIAS_DA_SEMANA;

  frequency: RecurrenceFrequency = 'weekly';
  weekdays: number[] = [];
  startDate = '';
  endDate = '';
  // Somente edicao
  items: RecurringOrderItem[] = [];
  shippingCost = 0;
  observations = '';

  private baseDaSugestao = '';
  /** Enquanto o usuario nao digitar a data, ela acompanha a agenda escolhida. */
  private startDateEditada = false;

  ngOnInit(): void {
    if (this.model) {
      this.carregarModelo(this.model);
      return;
    }
    this.baseDaSugestao = dataCivilDoPedido(this.order?.scheduledDate) ?? hojeCivil(new Date());
    this.atualizarSugestao();
  }

  get editing(): boolean { return !!this.model; }

  get usaDiasDaSemana(): boolean { return this.frequency === 'weekdays'; }

  onFrequencyChange(): void {
    if (!this.usaDiasDaSemana) this.weekdays = [];
    this.atualizarSugestao();
  }

  toggleWeekday(dia: number): void {
    this.weekdays = this.weekdays.includes(dia)
      ? this.weekdays.filter(d => d !== dia)
      : [...this.weekdays, dia];
    this.atualizarSugestao();
  }

  onStartDateInput(): void { this.startDateEditada = true; }

  clearEndDate(): void { this.endDate = ''; }

  removeItem(index: number): void { this.items.splice(index, 1); }

  save(): void {
    if (this.model) {
      this.saveEdition(this.model);
      return;
    }
    const agenda = this.montarAgenda();
    try {
      validarAgenda(agenda);
    } catch (error) {
      notificarErroDeRecorrencia(this.notif, error);
      return;
    }
    this.saved.emit(agenda);
  }

  private saveEdition(model: RecurringOrder): void {
    const agenda = { ...this.montarAgenda(), startDate: model.startDate };
    try {
      validarAgenda(agenda);
    } catch (error) {
      notificarErroDeRecorrencia(this.notif, error);
      return;
    }
    const erroDosCampos = this.erroDosCamposDoModelo();
    if (erroDosCampos) {
      this.notif.warning(erroDosCampos);
      return;
    }
    this.edited.emit({
      frequency: this.frequency,
      weekdays: this.usaDiasDaSemana ? agenda.weekdays : null,
      endDate: this.endDate || (model.endDate ? null : undefined),
      items: this.items.map(item => ({ ...item, quantity: Number(item.quantity) })),
      shippingCost: Number(this.shippingCost) || 0,
      observations: this.observations.trim()
    });
  }

  /** Validacao de entrada dos campos do molde; a regra definitiva segue no service. */
  private erroDosCamposDoModelo(): string | null {
    if (this.items.length === 0) return MENSAGEM_SEM_ITENS;
    for (const item of this.items) {
      const quantidade = Number(item.quantity);
      if (item.soldByWeight) {
        const peso = validarPeso(quantidade);
        if (!peso.valido) return peso.erro ?? MENSAGEM_QUANTIDADE_INVALIDA;
      } else if (!Number.isInteger(quantidade) || quantidade < 1) {
        return MENSAGEM_QUANTIDADE_INVALIDA;
      }
    }
    return Number(this.shippingCost) < 0 ? MENSAGEM_FRETE_INVALIDO : null;
  }

  private carregarModelo(model: RecurringOrder): void {
    this.frequency = model.frequency;
    this.weekdays = [...(model.weekdays ?? [])];
    this.startDate = model.startDate;
    this.endDate = model.endDate ?? '';
    this.items = model.items.map(item => ({ ...item }));
    this.shippingCost = model.shippingCost;
    this.observations = model.observations ?? '';
  }

  private montarAgenda(): AgendaDeRecorrencia {
    return {
      frequency: this.frequency,
      startDate: this.startDate,
      ...(this.usaDiasDaSemana ? { weekdays: [...this.weekdays].sort((a, b) => a - b) } : {}),
      ...(this.endDate ? { endDate: this.endDate } : {})
    };
  }

  private atualizarSugestao(): void {
    if (this.startDateEditada || this.editing) return;
    const sugerida = primeiraDataSugerida(
      { frequency: this.frequency, ...(this.usaDiasDaSemana ? { weekdays: this.weekdays } : {}) },
      this.baseDaSugestao
    );
    if (sugerida) this.startDate = sugerida;
  }
}
