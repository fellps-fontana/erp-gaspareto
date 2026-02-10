import { Timestamp } from "@angular/fire/firestore";

export interface Purchase {
    id: string;
    date: Timestamp;
    idProduct: string;
    unityValue: number;
    amount: number;
}