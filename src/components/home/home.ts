import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  // O RouterLink é obrigatório aqui para os botões levarem você ao PDV/Estoque
  imports: [CommonModule, RouterLink],
  templateUrl: './home.html',
  styleUrls: ['./home.css']
})
export class HomeComponent {
  // Por enquanto não precisamos de lógica aqui, só dos imports acima!
}