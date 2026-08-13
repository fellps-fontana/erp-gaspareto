# ErpGaspareto

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 20.3.13.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Ambientes (staging/homolog)

O projeto tem dois ambientes Firebase configurados em `.firebaserc`:

- `default` (`projetosfelipe-9e458`) — usado por `ng serve`/`ng build` sem
  flag de configuração, aponta pro Firestore local (`useEmulator: true` em
  `src/enviroments/enviroments.ts`).
- `hml` (`hologaerp`) — homologação/staging, banco real na nuvem
  (`src/enviroments/enviroments.staging.ts`).

Rodar localmente contra o banco de homologação (sem deploy):

```bash
npm run start:staging
```

Buildar e publicar o app no Firebase Hosting de homolog
(`https://hologaerp.web.app`):

```bash
npm run deploy:hosting:staging
```

Publicar `firestore.rules`/`firestore.indexes.json` em homolog (separado
do deploy de hosting — só necessário quando essas regras mudam):

```bash
npm run deploy:rules:staging
```

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
