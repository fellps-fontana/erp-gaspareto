import { Timestamp } from "@angular/fire/firestore";

export enum PaymentMethod {
    DINHEIRO = 'dinheiro',
    PIX = 'pix',
    CARTAO = 'cartao',
    CHEQUE = 'cheque'
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
    [PaymentMethod.DINHEIRO]: 'Dinheiro',
    [PaymentMethod.PIX]: 'Pix',
    [PaymentMethod.CARTAO]: 'Cartão',
    [PaymentMethod.CHEQUE]: 'Cheque'
};

export interface SaleItem {
    idProduct: string;
    productName: string;
    quantity: number;
    priceAtSale: number;
    priceAtCost: number; // Fundamental pro lucro!
}

export interface Sale {
    id?: string; // Opcional porque o Firestore gera depois
    companyId: string;
    total: number; // Use total pra bater com o Service
    date: Timestamp | any;
    items: SaleItem[];
    paymentMethod: PaymentMethod;
    installments?: number; // Metadado (1/ausente = à vista). Sem controle de parcela individual — nunca gera lançamento em bills.
    sale_type: 'pdv' | 'order'; // Pra gente saber a origem
    customerId?: string; // Só preenchido em pedidos (sale_type === 'order') com cliente vinculado
}