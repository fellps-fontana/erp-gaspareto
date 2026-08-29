import { Timestamp } from "@angular/fire/firestore";

export interface ComandaItem {
    idProduct: string;
    productName: string;
    quantity: number;
    priceAtSale: number;
    priceAtCost: number;
    soldByWeight?: boolean; // snapshot: true = quantity representa peso em kg
}

export interface Comanda {
    id?: string;
    companyId: string;
    customerName: string;
    items: ComandaItem[];
    total: number;
    createdAt: Timestamp | any;
    status: 'open' | 'closed';
}
