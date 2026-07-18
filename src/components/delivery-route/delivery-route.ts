import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { Order } from '../../models/order-model';
import { OrderService } from '../../services/order-service/order-service';
import { NotificationService } from '../../services/notification-service/notification.service';

interface OrderWithCoords extends Order {
  _lat: number;
  _lng: number;
}

@Component({
  selector: 'app-delivery-route',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './delivery-route.html',
  styleUrls: ['./delivery-route.css']
})
export class DeliveryRouteComponent implements OnInit, OnDestroy {
  private orderService = inject(OrderService);
  private notif = inject(NotificationService);
  private router = inject(Router);

  orders: Order[] = [];
  selectedIds = new Set<string>();
  isLoading = true;
  isGeneratingRoute = false;
  loadingTooLong = false;
  routeUrl: string | null = null;
  private sub?: Subscription;
  private loadingTimer?: ReturnType<typeof setTimeout>;

  get deliveryOrders(): Order[] {
    return this.orders.filter(o =>
      ['open', 'pending', 'preparing', 'ready', 'delivering'].includes(o.status) &&
      o.deliveryType === 'delivery' &&
      !!o.address
    );
  }

  get selectedOrders(): Order[] {
    return this.deliveryOrders.filter(o => this.selectedIds.has(o.id!));
  }

  ngOnInit() {
    this.sub = this.orderService.getPendingOrders().subscribe({
      next: orders => { this.orders = orders; this.isLoading = false; },
      error: () => { this.notif.error('Erro ao carregar pedidos.'); this.isLoading = false; }
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); clearTimeout(this.loadingTimer); }

  goBack() { this.router.navigate(['/']); }

  toggleSelect(order: Order) {
    if (!order.id) return;
    this.selectedIds.has(order.id)
      ? this.selectedIds.delete(order.id)
      : this.selectedIds.add(order.id);
    this.routeUrl = null;
  }

  toggleAll() {
    if (this.selectedIds.size === this.deliveryOrders.length) {
      this.selectedIds.clear();
    } else {
      this.deliveryOrders.forEach(o => o.id && this.selectedIds.add(o.id));
    }
    this.routeUrl = null;
  }

  async generateRoute() {
    const orders = this.selectedOrders;
    if (orders.length === 0) { this.notif.warning('Selecione ao menos um pedido.'); return; }

    this.routeUrl = null;
    this.loadingTooLong = false;
    this.isGeneratingRoute = true;

    // Apos 5s ainda calculando, avisa o usuario
    this.loadingTimer = setTimeout(() => { this.loadingTooLong = true; }, 5000);

    try {
      let url: string;

      // Resolve coordenadas: usa as salvas no pedido ou geocodifica pelo endereco
      const withCoords = await Promise.all(
        orders.map(async o => {
          if (o.addressLat != null && o.addressLng != null) {
            return { ...o, _lat: o.addressLat, _lng: o.addressLng } as OrderWithCoords;
          }
          const coords = await this.geocode(o.address!);
          return { ...o, _lat: coords?.lat ?? 0, _lng: coords?.lng ?? 0 } as OrderWithCoords;
        })
      );

      // Pega localizacao atual e otimiza com nearest-neighbor
      const startPos = await this.getCurrentPosition();
      const sorted = this.nearestNeighbor(
        withCoords,
        startPos?.lat ?? withCoords[0]._lat,
        startPos?.lng ?? withCoords[0]._lng
      );

      // Enderecos brutos na URL — sem encodeURIComponent.
      // O browser (Safari incluido) codifica corretamente ao navegar via <a href>,
      // evitando dupla codificacao que faz o Maps exibir %20, %2C etc. como texto.
      const dest   = sorted[sorted.length - 1].address!;
      const waypts = sorted.slice(0, -1).map(o => o.address!).join('|');

      url = `https://www.google.com/maps/dir/?api=1`;
      if (startPos) url += `&origin=${startPos.lat},${startPos.lng}`;
      url += `&destination=${dest}`;
      if (waypts) url += `&waypoints=${waypts}`;

      this.routeUrl = url;

    } catch {
      this.notif.error('Erro ao gerar rota.');
    } finally {
      clearTimeout(this.loadingTimer);
      this.isGeneratingRoute = false;
      this.loadingTooLong = false;
    }
  }

  // ── Geocodificação via Nominatim (OpenStreetMap, gratuito) ──────────
  private async geocode(address: string): Promise<{ lat: number; lng: number } | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=br`;
      const res  = await fetch(url, { signal: controller.signal, headers: { 'Accept-Language': 'pt-BR' } });
      const data = await res.json();
      if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    } catch {
      // timeout ou erro de rede — ignora, retorna null
    } finally {
      clearTimeout(timer);
    }
    return null;
  }

  // ── Geolocalização do dispositivo ───────────────────────────────────
  private getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
    return new Promise(resolve => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        p  => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { timeout: 5000 }
      );
    });
  }

  // ── Nearest-Neighbor greedy ─────────────────────────────────────────
  private nearestNeighbor(orders: OrderWithCoords[], startLat: number, startLng: number): OrderWithCoords[] {
    const remaining = [...orders];
    const sorted: OrderWithCoords[] = [];
    let lat = startLat, lng = startLng;

    while (remaining.length > 0) {
      let nearestIdx = 0, nearestDist = Infinity;
      remaining.forEach((o, i) => {
        const d = this.haversine(lat, lng, o._lat, o._lng);
        if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
      });
      const next = remaining.splice(nearestIdx, 1)[0];
      sorted.push(next);
      lat = next._lat; lng = next._lng;
    }
    return sorted;
  }

  private haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
            * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  translateStatus(status: string): string {
    const map: Record<string, string> = {
      open: 'Aberto', pending: 'Pendente', preparing: 'Preparando',
      ready: 'Pronto', delivering: 'Em Entrega'
    };
    return map[status] ?? status;
  }

  trackByOrder(_: number, o: Order): string { return o.id ?? ''; }
}
