import { Timestamp } from "@angular/fire/firestore";

export interface OrderItem {
  idProduct: string;
  productName: string;
  quantity: number;
  priceAtSale: number;
  priceAtCost: number; // Importante pro lucro
}

export interface Order {
  id?: string;             
  customerName: string;    
  customerPhone?: string;  
  
  items: OrderItem[];      
  
  // --- VALORES ---
  itemsTotal: number;      // Soma só dos produtos
  shippingCost: number;    // Valor do Frete (Novo!)
  total: number;           // itemsTotal + shippingCost (O que o cliente paga)
  
  // --- LOGÍSTICA ---
  deliveryType: 'pickup' | 'delivery'; // Retirada ou Entrega
  address?: string;        // Endereço (Só se for delivery)
  
  // --- STATUS & DATAS ---
  status: 'pending' | 'preparing' | 'ready' | 'delivering' | 'delivered' | 'finished' | 'canceled';
  
  createdAt: Timestamp;          // Data do pedido
  scheduledDate: Timestamp;      // Data agendada (Previsão)
  
  actualDeliveryDate?: Timestamp;// DATA DE ENTREGA (Preenchida no status 'delivered')
  paymentDate?: Timestamp;       // DATA DE PAGAMENTO (Preenchida quando pagar)
  closingDate?: Timestamp;       // DATA DE FECHAMENTO (Preenchida no status 'finished')
  
  observations?: string;   
}