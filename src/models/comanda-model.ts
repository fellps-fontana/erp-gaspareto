import { Timestamp } from "@angular/fire/firestore";

export interface ComandaItem {
    idProduct: string;
    productName: string;
    quantity: number;
    priceAtSale: number;
    priceAtCost: number;
}

export interface Comanda {
    id?: string;
    customerName: string;
    items: ComandaItem[];
    total: number;
    createdAt: Timestamp | any;
    status: 'open' | 'closed';
}
