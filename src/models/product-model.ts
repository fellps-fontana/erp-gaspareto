export interface Product {
    id?: string;
    companyId: string;
    title: string;
    buyPrice: number;
    sellPrice: number;
    stock: number;
    urlImage?: string;
    color?: string;
}