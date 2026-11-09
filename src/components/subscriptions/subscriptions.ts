import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { combineLatest } from 'rxjs';
import { Company } from '../../models/company-model';
import {
  ChargeNotice, CivilDate, SubscriptionCharge, SubscriptionConfig
} from '../../models/subscription-model';
import { CompanyService } from '../../services/company-service/company-service';
import { NotificationService } from '../../services/notification-service/notification.service';
import { hojeCivil } from '../../services/recurring-order-service/recurrence-rules';
import { SubscriptionService } from '../../services/subscription-service/subscription-service';
import {
  CodigoMensalidadeInvalida, GeracaoParcialError, MensalidadeInvalidaError, avisoDaCobranca, textoDoAviso
} from '../../services/subscription-service/subscription-rules';

const MENSAGENS_DE_ERRO: Record<CodigoMensalidadeInvalida, string> = {
  VALOR_INVALIDO: 'Informe um valor maior que zero, com no máximo 2 casas decimais.',
  DIA_VENCIMENTO_INVALIDO: 'O dia de vencimento deve ser um número de 1 a 31.',
  INICIO_INVALIDO: 'Informe uma data válida para o início do contrato.',
  JA_PAGA: 'Esta cobrança já está marcada como paga.',
  NAO_PAGA: 'Esta cobrança não está paga, não há o que desfazer.',
  DATA_PAGAMENTO_INVALIDA: 'Informe uma data de pagamento válida.',
  COBRANCA_NAO_ENCONTRADA: 'Cobrança não encontrada. Recarregue a tela.'
};

const ERRO_CARGA = 'Erro ao carregar as assinaturas.';
const ERRO_GENERICO = 'Não foi possível concluir a operação. Tente novamente.';
const ERRO_GERACAO = 'Não foi possível gerar as cobranças do mês.';

type TomDoEstado = 'neutro' | 'aviso' | 'atraso' | 'pago';

export interface CobrancaView {
  cobranca: SubscriptionCharge;
  rotulo: string;
  tom: TomDoEstado;
}

export interface AssinaturaView {
  company: Company;
  config: SubscriptionConfig | null;
  cobrancas: CobrancaView[];
}

interface FormularioConfig {
  amount: number | null;
  dueDay: number | null;
  active: boolean;
  contractStart: CivilDate;
}

type AcaoPendente =
  | { tipo: 'recebi'; cobranca: SubscriptionCharge; data: CivilDate }
  | { tipo: 'desfazer'; cobranca: SubscriptionCharge };

/** Tela de Assinaturas do super-admin — regra-de-negocio.md secao 14. Regras vivem em subscription-rules. */
@Component({
  selector: 'app-subscriptions',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './subscriptions.html',
  styleUrls: ['./subscriptions.css'],
})
export class SubscriptionsComponent implements OnInit {
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly companyService = inject(CompanyService);
  private readonly notif = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  assinaturas: AssinaturaView[] = [];
  isLoading = true;
  loadError: string | null = null;

  editandoId: string | null = null;
  form: FormularioConfig = this.formularioVazio();
  isSaving = false;

  acao: AcaoPendente | null = null;
  isProcessing = false;

  ngOnInit(): void {
    this.observarDados();
    void this.gerarCobrancas();
  }

  abrirConfiguracao(item: AssinaturaView): void {
    this.editandoId = item.company.id ?? null;
    this.form = item.config
      ? {
          amount: item.config.amount,
          dueDay: item.config.dueDay,
          active: item.config.active,
          contractStart: item.config.contractStart
        }
      : this.formularioVazio();
  }

  fecharConfiguracao(): void {
    this.editandoId = null;
  }

  async salvarConfiguracao(item: AssinaturaView): Promise<void> {
    const companyId = item.company.id;
    if (!companyId || this.isSaving) {
      return;
    }
    this.isSaving = true;
    try {
      await this.subscriptionService.saveConfig(companyId, {
        amount: this.form.amount as number,
        dueDay: this.form.dueDay as number,
        active: this.form.active,
        contractStart: this.form.contractStart
      });
      this.notif.success('Assinatura salva.');
      this.fecharConfiguracao();
      await this.gerarCobrancas();
    } catch (error) {
      this.notificarErro(error, 'Erro ao salvar a assinatura.');
    } finally {
      this.isSaving = false;
    }
  }

  pedirRecebi(cobranca: SubscriptionCharge): void {
    this.acao = { tipo: 'recebi', cobranca, data: hojeCivil(new Date()) };
  }

  pedirDesfazer(cobranca: SubscriptionCharge): void {
    this.acao = { tipo: 'desfazer', cobranca };
  }

  cancelarAcao(): void {
    if (!this.isProcessing) {
      this.acao = null;
    }
  }

  async confirmarAcao(): Promise<void> {
    const acao = this.acao;
    const chargeId = acao?.cobranca.id;
    if (!acao || !chargeId || this.isProcessing) {
      return;
    }
    this.isProcessing = true;
    try {
      if (acao.tipo === 'recebi') {
        await this.subscriptionService.markAsPaid(chargeId, acao.data);
        this.notif.success('Pagamento registrado.');
      } else {
        await this.subscriptionService.undoPayment(chargeId);
        this.notif.success('Pagamento desfeito.');
      }
      this.acao = null;
    } catch (error) {
      this.notificarErro(error, ERRO_GENERICO);
    } finally {
      this.isProcessing = false;
    }
  }

  private async gerarCobrancas(): Promise<void> {
    try {
      await this.subscriptionService.generateDueCharges();
    } catch (error) {
      console.error('Assinaturas: erro ao gerar cobranças:', error);
      if (error instanceof GeracaoParcialError) {
        this.notif.warning(
          `Não foi possível gerar a mensalidade de ${error.empresasComFalha.length} empresa(s).`
        );
        return;
      }
      this.notif.error(ERRO_GERACAO);
    }
  }

  private observarDados(): void {
    combineLatest([
      this.companyService.getCompanies(),
      this.subscriptionService.getConfigs(),
      this.subscriptionService.getCharges()
    ]).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ([companies, configs, charges]) => {
        this.assinaturas = this.montarVisao(companies, configs, charges);
        this.isLoading = false;
        this.loadError = null;
      },
      error: error => {
        console.error('Assinaturas: erro ao carregar dados:', error);
        this.isLoading = false;
        this.loadError = ERRO_CARGA;
      }
    });
  }

  private montarVisao(
    companies: Company[],
    configs: SubscriptionConfig[],
    charges: SubscriptionCharge[]
  ): AssinaturaView[] {
    const hoje = hojeCivil(new Date());
    return companies.map(company => ({
      company,
      config: configs.find(config => config.companyId === company.id) ?? null,
      cobrancas: charges
        .filter(cobranca => cobranca.companyId === company.id)
        .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
        .map(cobranca => this.visaoDaCobranca(cobranca, hoje))
    }));
  }

  private visaoDaCobranca(cobranca: SubscriptionCharge, hoje: CivilDate): CobrancaView {
    const aviso = avisoDaCobranca(cobranca, hoje);
    return { cobranca, rotulo: this.rotuloDoAviso(aviso), tom: this.tomDoAviso(aviso) };
  }

  private rotuloDoAviso(aviso: ChargeNotice): string {
    const texto = textoDoAviso(aviso);
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  private tomDoAviso(aviso: ChargeNotice): TomDoEstado {
    switch (aviso.kind) {
      case 'pago': return 'pago';
      case 'em_atraso': return 'atraso';
      case 'vence': return 'aviso';
      default: return 'neutro';
    }
  }

  private notificarErro(error: unknown, fallback: string): void {
    if (error instanceof MensalidadeInvalidaError) {
      this.notif.warning(MENSAGENS_DE_ERRO[error.codigo]);
      return;
    }
    console.error('Assinaturas: erro:', error);
    this.notif.error(fallback);
  }

  private formularioVazio(): FormularioConfig {
    return { amount: null, dueDay: null, active: true, contractStart: hojeCivil(new Date()) };
  }
}
