export interface ModuleConfig {
  pdv: boolean;
  pedidos: boolean;
  gestao: boolean;      // controla a rota /estoque inteira
  rotas: boolean;
  contas: boolean;
  clientes: boolean;    // controla a aba Clientes dentro de /estoque
  compras: boolean;     // controla a aba Compras dentro de /estoque
}

export interface CompanyConfig {
  id?: string;
  modules: ModuleConfig;
}

export const DEFAULT_MODULES: ModuleConfig = {
  pdv: true,
  pedidos: true,
  gestao: true,
  rotas: true,
  contas: true,
  clientes: true,
  compras: true,
};
