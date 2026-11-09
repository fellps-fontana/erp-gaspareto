import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { catchError, from, of, switchMap } from 'rxjs';
import { ThemeService } from '../../services/theme/theme-service';
import { ConfigService } from '../../services/config/config.service';
import { CustomerService } from '../../services/customer-service/customer-service';
import { TenantService } from '../../services/tenant-service/tenant-service';
import { CompanyService } from '../../services/company-service/company-service';
import { BuildInfoService } from '../../services/build-info-service/build-info-service';
import { SubscriptionService } from '../../services/subscription-service/subscription-service';
import { cobrancasComAviso, textoDoAviso } from '../../services/subscription-service/subscription-rules';
import { hojeCivil } from '../../services/recurring-order-service/recurrence-rules';
import { Company } from '../../models/company-model';
import { BuildInfo } from '../../models/build-info-model';
import { CivilDate, SubscriptionCharge } from '../../models/subscription-model';

/** Item do painel de Notificações referente à mensalidade da plataforma. */
interface AvisoMensalidade {
  id: string;
  texto: string;
  emAtraso: boolean;
  valor: number;
  vencimento: CivilDate;
}

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
  private readonly subscriptionService = inject(SubscriptionService);

  // Lista de clientes que fazem aniversário hoje — usada pelo ícone/painel de notificação
  // (visível só quando config.modules().notificacoes.aniversario está ligado).
  readonly aniversariantes = toSignal(this.customerService.getAniversariantesDoDia(), {
    initialValue: [],
  });

  // Cobranças de mensalidade em aberto da empresa efetiva (regra-de-negocio.md seção 14).
  // Sem companyId (deslogado/carregando) não consulta. Falha de leitura não derruba a home.
  private readonly cobrancasEmAberto = toSignal(
    toObservable(this.tenant.companyId).pipe(
      switchMap(companyId =>
        companyId
          ? this.subscriptionService.getOpenChargesOfCompany(companyId).pipe(
              catchError(error => {
                console.error('Home: erro ao carregar cobranças da mensalidade:', error);
                return of([] as SubscriptionCharge[]);
              })
            )
          : of([] as SubscriptionCharge[])
      )
    ),
    { initialValue: [] as SubscriptionCharge[] }
  );

  // Janela de aviso e atraso vêm da função pura de domínio; aqui só se monta o texto exibido.
  // O aviso não depende de modules.notificacoes: a empresa não pode desligá-lo.
  // "Hoje" é avaliado quando as cobranças mudam; a virada do dia com a aba aberta
  // não recalcula (aceito na v1).
  readonly avisosMensalidade = computed<AvisoMensalidade[]>(() =>
    cobrancasComAviso(this.cobrancasEmAberto(), hojeCivil(new Date())).map(
      ({ cobranca, aviso }) => ({
        id: cobranca.id ?? cobranca.competence,
        texto: `Mensalidade ${textoDoAviso(aviso)}`,
        emAtraso: aviso.kind === 'em_atraso',
        valor: cobranca.amount,
        vencimento: cobranca.dueDate,
      })
    )
  );

  readonly aniversariantesVisiveis = computed(() =>
    this.config.modules().notificacoes.aniversario ? this.aniversariantes() : []
  );

  readonly mostrarAniversariantes = computed(
    () => this.config.modules().notificacoes.aniversario
  );

  // Sino aparece se houver aniversariantes (módulo ligado) ou aviso de mensalidade.
  readonly totalNotificacoes = computed(
    () => this.aniversariantesVisiveis().length + this.avisosMensalidade().length
  );

  readonly mostrarSino = computed(
    () => this.mostrarAniversariantes() || this.avisosMensalidade().length > 0
  );

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

  trackAviso(_indice: number, aviso: AvisoMensalidade): string {
    return aviso.id;
  }

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
