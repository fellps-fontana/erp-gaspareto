export interface Product {
    id?: string;
    companyId: string;
    title: string;
    buyPrice: number;
    sellPrice: number;      // quando soldByWeight === true, representa PREÇO POR KG
    stock: number;          // quando soldByWeight === true, representa ESTOQUE EM KG
    urlImage?: string;
    color?: string;
    soldByWeight?: boolean;  // ausente/false = produto por unidade (comportamento atual, sem migração)
}