import { Timestamp } from "@angular/fire/firestore";

export enum PaymentMethod {
    DINHEIRO = 'dinheiro',
    PIX = 'pix'
}

export interface SaleItem {
    idProduct: string;
    productName: string;
    quantity: number;
    priceAtSale: number;
    priceAtCost: number; // Fundamental pro lucro!
}

export interface Sale {
    id?: string; // Opcional porque o Firestore gera depois
    total: number; // Use total pra bater com o Service
    date: Timestamp | any; 
    items: SaleItem[];
    paymentMethod: PaymentMethod;
    sale_type: 'pdv' | 'order'; // Pra gente saber a origem
}