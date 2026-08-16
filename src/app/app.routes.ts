import { Routes } from '@angular/router';
import { ProductInventoryComponent } from '../components/product-inventory/product-inventory';
import { PdvComponent } from '../components/pdv/pdv';
import { HomeComponent } from '../components/home/home';
import { OrdersComponent } from '../components/order/order';
import { DeliveryRouteComponent } from '../components/delivery-route/delivery-route';
import { BillsComponent } from '../components/bills/bills';
import { ConfigComponent } from '../components/config/config';
import { LoginComponent } from '../components/login/login';
import { SignupComponent } from '../components/signup/signup';
import { SuperAdminComponent } from '../components/super-admin/super-admin';
import { authGuard } from '../guards/auth.guard';
import { moduleGuard } from '../guards/module.guard';
import { superAdminGuard } from '../guards/super-admin.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent, canActivate: [authGuard] },
  { path: 'login', component: LoginComponent },
  { path: 'signup', component: SignupComponent },
  { path: 'pdv', component: PdvComponent, canActivate: [authGuard, moduleGuard], data: { module: 'pdv' } },
  { path: 'estoque', component: ProductInventoryComponent, canActivate: [authGuard, moduleGuard], data: { module: 'gestao' } },
  { path: 'orders', component: OrdersComponent, canActivate: [authGuard, moduleGuard], data: { module: 'pedidos' } },
  { path: 'rotas', component: DeliveryRouteComponent, canActivate: [authGuard, moduleGuard], data: { module: 'rotas' } },
  { path: 'contas', component: BillsComponent, canActivate: [authGuard, moduleGuard], data: { module: 'contas' } },
  { path: 'config', component: ConfigComponent },
  { path: 'admin', component: SuperAdminComponent, canActivate: [authGuard, superAdminGuard] },
  { path: '**', redirectTo: '' }
];
