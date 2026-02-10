import { Timestamp } from "@angular/fire/firestore";

export interface SaleItem {
    idProduct: string;
    productName: string;
    quantity: number;
    priceAtSale: number;
} 
export interface Sale {
    id: string;
    value: number;
    date: Timestamp;
    items: SaleItem[];
}