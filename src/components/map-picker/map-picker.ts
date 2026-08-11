import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { GeocodingService } from '../../services/geocoding-service/geocoding-service';

// Centro genérico do Brasil, usado quando não há posição salva nem
// geolocalização do navegador disponível — o usuário navega manualmente.
const BRAZIL_FALLBACK_CENTER: L.LatLngTuple = [-14.235, -51.9253];
const BRAZIL_FALLBACK_ZOOM = 4;

L.Icon.Default.mergeOptions({
  iconUrl: '/leaflet/marker-icon.png',
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  shadowUrl: '/leaflet/marker-shadow.png',
});

@Component({
  selector: 'app-map-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './map-picker.html',
  styleUrls: ['./map-picker.css'],
})
export class MapPickerComponent implements AfterViewInit, OnChanges, OnDestroy {
  private geocodingService = inject(GeocodingService);

  @Input() lat?: number;
  @Input() lng?: number;
  @Input() zoom = 15;
  @Output() positionChange = new EventEmitter<{ lat: number; lng: number }>();

  @ViewChild('mapContainer', { static: true }) mapContainerRef!: ElementRef<HTMLDivElement>;

  searchTerm = '';
  searchLoading = false;
  searchError = '';

  private map?: L.Map;
  private marker?: L.Marker;
  private viewInitialized = false;

  async ngAfterViewInit() {
    this.map = L.map(this.mapContainerRef.nativeElement);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.setMarker(e.latlng.lat, e.latlng.lng);
      this.positionChange.emit({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    if (this.lat != null && this.lng != null) {
      this.map.setView([this.lat, this.lng], this.zoom);
      this.setMarker(this.lat, this.lng);
    } else {
      const current = await this.getCurrentPosition();
      if (current) {
        this.map.setView([current.lat, current.lng], this.zoom);
      } else {
        this.map.setView(BRAZIL_FALLBACK_CENTER, BRAZIL_FALLBACK_ZOOM);
      }
    }

    this.viewInitialized = true;
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!this.viewInitialized || !this.map) return;
    if (('lat' in changes || 'lng' in changes) && this.lat != null && this.lng != null) {
      this.map.setView([this.lat, this.lng], this.zoom);
      this.setMarker(this.lat, this.lng);
    }
  }

  ngOnDestroy() {
    this.map?.remove();
  }

  async onSearch() {
    const term = this.searchTerm.trim();
    if (!term || !this.map) return;

    this.searchLoading = true;
    this.searchError = '';
    try {
      const result = await this.geocodingService.geocode(term);
      if (result) {
        this.map.setView([result.lat, result.lng], this.zoom);
      } else {
        this.searchError = 'Endereço não encontrado. Tente refinar a busca.';
      }
    } finally {
      this.searchLoading = false;
    }
  }

  private setMarker(lat: number, lng: number) {
    if (!this.map) return;
    if (this.marker) {
      this.marker.setLatLng([lat, lng]);
      return;
    }
    this.marker = L.marker([lat, lng], { draggable: true }).addTo(this.map);
    this.marker.on('dragend', () => {
      const pos = this.marker!.getLatLng();
      this.positionChange.emit({ lat: pos.lat, lng: pos.lng });
    });
  }

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
}
