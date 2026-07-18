import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ModuleConfig } from '../../models/company-config';
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

  readonly moduleOptions: ModuleOption[] = [
    { key: 'pdv', label: 'PDV', description: 'Vendas no balcão' },
    { key: 'pedidos', label: 'Pedidos', description: 'Encomendas e cozinha' },
    { key: 'gestao', label: 'Gestão', description: 'Estoque, relatórios e compras' },
    { key: 'rotas', label: 'Rotas', description: 'Entregas e navegação' },
    { key: 'contas', label: 'Contas', description: 'Contas a pagar' },
    { key: 'clientes', label: 'Clientes', description: 'Cadastro de clientes (sub-módulo do Gestão)', sub: true },
    { key: 'compras', label: 'Compras', description: 'Entrada de estoque (sub-módulo do Gestão)', sub: true },
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
}
