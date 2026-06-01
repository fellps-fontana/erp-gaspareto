import { Routes } from '@angular/router';
import { ProductInventoryComponent } from '../components/product-inventory/product-inventory';
import { PdvComponent } from '../components/pdv/pdv';
import { HomeComponent } from '../components/home/home';
import { OrdersComponent } from '../components/order/order';
import { DeliveryRouteComponent } from '../components/delivery-route/delivery-route';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'pdv', component: PdvComponent },
  { path: 'estoque', component: ProductInventoryComponent },
  { path: 'orders', component: OrdersComponent },
  { path: 'rotas', component: DeliveryRouteComponent },
  { path: '**', redirectTo: '' }
];
