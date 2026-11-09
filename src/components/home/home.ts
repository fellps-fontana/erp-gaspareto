import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { from, map, of, switchMap } from 'rxjs';
import { ThemeService } from '../../services/theme/theme-service';
import { ConfigService } from '../../services/config/config.service';
import { CustomerService } from '../../services/customer-service/customer-service';
import { TenantService } from '../../services/tenant-service/tenant-service';
import { CompanyService } from '../../services/company-service/company-service';
import { BuildInfoService } from '../../services/build-info-service/build-info-service';
import { ExpenseService } from '../../services/expense-service/expense-service';
import { OrderService } from '../../services/order-service/order-service';
import { ExpenseScheduleService } from '../../services/expense-schedule-service/expense-schedule-service';
import {
  AvisoDespesa,
  AvisoParcela,
  JANELA_AVISO_DIAS,
  despesasAVencer,
  parcelasAVencer,
} from '../../services/notification-rules/notification-rules';
import { DateKey } from '../../models/expense-model';
import { Company } from '../../models/company-model';
import { BuildInfo } from '../../models/build-info-model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './home.html',
  styleUrls: ['./home.css'],
})
export class HomeComponent {
  readonly theme = inject(ThemeService);
  readonly config = inject(ConfigService);
  readonly tenant = inject(TenantService);
  private readonly customerService = inject(CustomerService);
  private readonly companyService = inject(CompanyService);
  private readonly buildInfoService = inject(BuildInfoService);
  private readonly expenseService = inject(ExpenseService);
  private readonly orderService = inject(OrderService);

  readonly janelaAvisoDias = JANELA_AVISO_DIAS;

  // Flags efetivas: sub-flag de notificacao E modulo correspondente ativos.
  readonly avisaAniversario = computed(() => this.config.modules().notificacoes.aniversario);
  readonly avisaDespesas = computed(() => {
    const modules = this.config.modules();
    return modules.notificacoes.despesasVencendo && modules.contas;
  });
  readonly avisaParcelas = computed(() => {
    const modules = this.config.modules();
    return modules.notificacoes.parcelasVencendo && modules.pedidos;
  });
  readonly sinoVisivel = computed(
    () => this.avisaAniversario() || this.avisaDespesas() || this.avisaParcelas()
  );

  // Lista de clientes que fazem aniversário hoje — usada pelo ícone/painel de notificação
  // (visível só quando config.modules().notificacoes.aniversario está ligado).
  readonly aniversariantes = toSignal(this.customerService.getAniversariantesDoDia(), {
    initialValue: [],
  });

  // Avisos de vencimento: so assina o stream do modulo quando a flag efetiva esta ligada.
  // As regras de janela/vencida vivem em notification-rules (funcoes puras).
  readonly avisosDespesas = toSignal(
    toObservable(this.avisaDespesas).pipe(
      switchMap(ativo =>
        ativo
          ? this.expenseService.getExpenses().pipe(map(list => despesasAVencer(list, this.hoje())))
          : of([] as AvisoDespesa[])
      )
    ),
    { initialValue: [] as AvisoDespesa[] }
  );

  readonly avisosParcelas = toSignal(
    toObservable(this.avisaParcelas).pipe(
      switchMap(ativo =>
        ativo
          ? this.orderService.getOrders().pipe(map(list => parcelasAVencer(list, this.hoje())))
          : of([] as AvisoParcela[])
      )
    ),
    { initialValue: [] as AvisoParcela[] }
  );

  // Badge do sino = soma dos avisos ativos (cada lista ja vem vazia quando desligada).
  readonly totalAvisos = computed(
    () =>
      (this.avisaAniversario() ? this.aniversariantes().length : 0) +
      this.avisosDespesas().length +
      this.avisosParcelas().length
  );

  // Rotulo de vencimento: apenas formatacao; "vencida" vem pronto das regras.
  rotuloVencimento(aviso: { dueDate: DateKey; vencida: boolean }): string {
    const hoje = this.hoje();
    if (aviso.dueDate === hoje) return 'vence hoje';
    if (aviso.dueDate === ExpenseScheduleService.addDays(hoje, 1)) return 'vence amanhã';
    const [, mes, dia] = aviso.dueDate.split('-');
    return `${aviso.vencida ? 'venceu em' : 'vence em'} ${dia}/${mes}`;
  }

  private hoje(): DateKey {
    return ExpenseScheduleService.toDateKey(new Date());
  }

  // Empresas cadastradas na plataforma — alimenta o seletor de empresa ativa do super-admin
  // (regra-de-negocio.md seção 13). Só consulta a coleção `companies` quando o usuário logado
  // é super-admin: usuário comum não tem permissão de listar todas as empresas
  // (firestore.rules), então a query nem é disparada nesse caso.
  readonly companies = toSignal(
    toObservable(this.tenant.isSuperAdmin).pipe(
      switchMap(isSuperAdmin =>
        isSuperAdmin ? this.companyService.getCompanies() : of([] as Company[])
      )
    ),
    { initialValue: [] as Company[] }
  );

  // Versão do último deploy (/build-info.json) — exibida só no banner do super-admin, então
  // usuário comum nem dispara o fetch. Null = arquivo ausente/inválido (ex.: ng serve).
  readonly buildInfo = toSignal(
    toObservable(this.tenant.isSuperAdmin).pipe(
      switchMap(isSuperAdmin =>
        isSuperAdmin ? from(this.buildInfoService.getBuildInfo()) : of(null)
      )
    ),
    { initialValue: null as BuildInfo | null }
  );

  // Nome de exibição da empresa ativa na sessão (override do super-admin ou a própria empresa).
  get selectedCompanyName(): string {
    const companyId = this.tenant.companyId();
    return this.companies().find(c => c.id === companyId)?.name ?? (companyId ?? '');
  }

  // Bridge de leitura/escrita para o <select [(ngModel)]>: delega o estado real para o
  // TenantService (fonte única de verdade da sessão), sem duplicar estado local.
  get selectedCompanyId(): string | null {
    return this.tenant.companyId();
  }

  set selectedCompanyId(companyId: string | null) {
    this.tenant.setActiveCompanyOverride(companyId || null);
  }

  // Painel de notificações de aniversariantes: fechado por padrão, não persiste entre reloads.
  readonly notificacoesAbertas = signal(false);

  toggleNotificacoes(event: Event): void {
    event.stopPropagation();
    this.notificacoesAbertas.update(aberto => !aberto);
  }

  fecharNotificacoes(): void {
    this.notificacoesAbertas.set(false);
  }

  // Fecha o painel ao clicar fora dele (cliques no ícone/painel têm stopPropagation
  // e não chegam a este listener).
  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.notificacoesAbertas()) {
      this.fecharNotificacoes();
    }
  }
}
