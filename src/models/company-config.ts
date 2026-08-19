export interface NotificationConfig {
  aniversario: boolean;
}

export interface ModuleConfig {
  pdv: boolean;
  pedidos: boolean;
  gestao: boolean;      // controla a rota /estoque inteira
  rotas: boolean;
  contas: boolean;
  clientes: boolean;    // controla a aba Clientes dentro de /estoque
  compras: boolean;     // controla a aba Compras dentro de /estoque
  vendedores: boolean;  // controla a aba Vendedores dentro de /estoque, a sub-aba do Dashboard e o campo de vendedor no Pedido
  notificacoes: NotificationConfig;
}

export interface CompanyConfig {
  id?: string;
  modules: ModuleConfig;
}

export const DEFAULT_NOTIFICATIONS: NotificationConfig = {
  aniversario: true,
};

export const DEFAULT_MODULES: ModuleConfig = {
  pdv: true,
  pedidos: true,
  gestao: true,
  rotas: true,
  contas: true,
  clientes: true,
  compras: true,
  vendedores: true,
  notificacoes: { ...DEFAULT_NOTIFICATIONS },
};

export const MANDATORY_MODULE_KEYS = ['gestao', 'clientes'] as const;
