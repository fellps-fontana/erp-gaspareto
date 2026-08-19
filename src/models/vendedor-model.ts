export interface VendedorComissaoItem {
  idProduct: string;
  percentual: number; // 0-100. Produto ausente da lista = 0%/sem comissão nesse produto.
}

export interface Vendedor {
  id?: string;
  companyId: string;
  name: string;
  comissoes: VendedorComissaoItem[];
}

export interface VendedorItemVendidoResultado {
  idProduct: string;
  productName: string;
  quantidade: number;
  totalVendido: number;
  totalComissao: number;
  percentual: number;
}

export interface ComissaoVendedorResultado {
  vendedorId: string;
  vendedorName: string;
  totalVendido: number;
  totalComissao: number;
  itens: VendedorItemVendidoResultado[];
}
