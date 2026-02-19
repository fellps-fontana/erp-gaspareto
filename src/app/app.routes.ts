import { Routes } from '@angular/router';
import { ProductInventoryComponent } from '../components/product-inventory/product-inventory';
import { PdvComponent } from '../components/pdv/pdv';
import { HomeComponent } from '../components/home/home';
import { OrdersComponent } from '../components/order/order';

export const routes: Routes = [
  { path: '', component: HomeComponent }, // Tela inicial com os botões grandes
  { path: 'pdv', component: PdvComponent }, // Tela de vendas
  { path: 'estoque', component: ProductInventoryComponent }, // Tela de gestão
  { path: 'orders', component: OrdersComponent },
  { path: '**', redirectTo: '' } // Se digitar algo errado, volta para o início
];