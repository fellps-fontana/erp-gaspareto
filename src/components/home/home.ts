import { Component, HostListener, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';
import { ThemeService } from '../../services/theme/theme-service';
import { ConfigService } from '../../services/config/config.service';
import { CustomerService } from '../../services/customer-service/customer-service';
import { TenantService } from '../../services/tenant-service/tenant-service';
import { CompanyService } from '../../services/company-service/company-service';
import { Company } from '../../models/company-model';

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

  // Lista de clientes que fazem aniversário hoje — usada pelo ícone/painel de notificação
  // (visível só quando config.modules().notificacoes.aniversario está ligado).
  readonly aniversariantes = toSignal(this.customerService.getAniversariantesDoDia(), {
    initialValue: [],
  });

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
