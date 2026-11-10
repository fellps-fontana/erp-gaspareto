# Navegação

Mapa das telas. Arquivo novo; cobre por enquanto as telas tocadas pelas
branches desde a sua criação — demais rotas estão em `src/app/app.routes.ts`.

| Rota | Tela | Guarda | De onde se chega | Para onde vai | Parâmetros |
|---|---|---|---|---|---|
| `/` | Home (`HomeComponent`) — cards de módulos + sino de notificações (aniversário, mensalidade) | `authGuard` | login, qualquer "voltar" | módulos, `/config`, `/admin` (super-admin) | — |
| `/admin` | Administrador (`SuperAdminComponent`) — seletor de empresa, usuários | `authGuard`, `superAdminGuard` | Home (super-admin) | `/admin/assinaturas`, `/` | — |
| `/admin/assinaturas` | Assinaturas (`SubscriptionsComponent`) — config de mensalidade por empresa, cobranças, Recebi/Desfazer; gera cobranças ao abrir | `authGuard`, `superAdminGuard` | botão "Assinaturas" em `/admin` | `/admin` (Voltar) | — |
