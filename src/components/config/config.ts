import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ModuleConfig, NotificationConfig } from '../../models/company-config';
import { ConfigService } from '../../services/config/config.service';
import { NotificationService } from '../../services/notification-service/notification.service';

interface ModuleOption {
  key: keyof ModuleConfig;
  label: string;
  description: string;
  sub?: boolean;
}

@Component({
  selector: 'app-config',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './config.html',
  styleUrls: ['./config.css'],
})
export class ConfigComponent {
  readonly config = inject(ConfigService);
  private notif = inject(NotificationService);

  readonly saving = signal<keyof ModuleConfig | null>(null);

  // Gestão e Clientes são módulos obrigatórios (regra-de-negocio.md seção 11):
  // nem aparecem aqui como opção — só módulos que podem ser desligados são configuráveis.
  readonly moduleOptions: ModuleOption[] = [
    { key: 'pdv', label: 'PDV', description: 'Vendas no balcão' },
    { key: 'pedidos', label: 'Pedidos', description: 'Encomendas e cozinha' },
    { key: 'rotas', label: 'Rotas', description: 'Entregas e navegação' },
    { key: 'contas', label: 'Despesas', description: 'Despesas e contas a pagar' },
    { key: 'vendedores', label: 'Vendedores', description: 'Comissão por vendedor (sub-módulo do Gestão)', sub: true },
  ];

  async toggleModule(key: keyof ModuleConfig) {
    if (this.saving()) return;
    this.saving.set(key);
    try {
      await this.config.updateModules({ [key]: !this.config.modules()[key] });
    } catch {
      this.notif.error('Erro ao salvar configuração. ❌');
    } finally {
      this.saving.set(null);
    }
  }

  // Toggles dedicados: `notificacoes` e objeto aninhado, nao pode passar por toggleModule
  // (que faz !valor direto e corromperia o dado). Monta o objeto completo via spread.
  toggleNotificacaoAniversario() {
    return this.toggleNotificacao('aniversario');
  }

  toggleNotificacaoDespesas() {
    return this.toggleNotificacao('despesasVencendo');
  }

  toggleNotificacaoParcelas() {
    return this.toggleNotificacao('parcelasVencendo');
  }

  private async toggleNotificacao(campo: keyof NotificationConfig) {
    if (this.saving()) return;
    this.saving.set('notificacoes');
    try {
      const atual = this.config.modules().notificacoes;
      await this.config.updateModules({ notificacoes: { ...atual, [campo]: !atual[campo] } });
    } catch {
      this.notif.error('Erro ao salvar configuração. ❌');
    } finally {
      this.saving.set(null);
    }
  }
}
