import { Routes } from '@angular/router';
import { ProductInventoryComponent } from '../components/product-inventory/product-inventory';
import { PdvComponent } from '../components/pdv/pdv';
import { HomeComponent } from '../components/home/home';
import { OrdersComponent } from '../components/order/order';
import { DeliveryRouteComponent } from '../components/delivery-route/delivery-route';
import { BillsComponent } from '../components/bills/bills';
import { ConfigComponent } from '../components/config/config';
import { moduleGuard } from '../guards/module.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'pdv', component: PdvComponent, canActivate: [moduleGuard], data: { module: 'pdv' } },
  { path: 'estoque', component: ProductInventoryComponent, canActivate: [moduleGuard], data: { module: 'gestao' } },
  { path: 'orders', component: OrdersComponent, canActivate: [moduleGuard], data: { module: 'pedidos' } },
  { path: 'rotas', component: DeliveryRouteComponent, canActivate: [moduleGuard], data: { module: 'rotas' } },
  { path: 'contas', component: BillsComponent, canActivate: [moduleGuard], data: { module: 'contas' } },
  { path: 'config', component: ConfigComponent },
  { path: '**', redirectTo: '' }
];
