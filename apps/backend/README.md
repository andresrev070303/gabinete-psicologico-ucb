<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

Backend del Gabinete de Servicios Psicológicos UCB. Monolito modular por dominios,
con capas internas y API REST sobre HTTPS. El código de identidad se organiza en
`src/modules/identity/domain`, `application`, `infrastructure` y `presentation`.

## Inicializar identidad en development

Este bloque instala el catálogo aprobado de identidad y la primera cuenta
administradora. La autenticación HTTP se configura en el bloque siguiente;
la administración de otras cuentas todavía está pendiente.

1. En Neon, selecciona `development / gabinete_ucb`, el propietario y **pooling OFF**.
2. Guarda esa cadena únicamente en `.env.migrations`, como `MIGRATION_DATABASE_URL`.
   Puedes usar `.env.migrations.example` como referencia. El archivo real está ignorado por Git.
3. Desde una terminal local interactiva en `apps/backend`, ejecuta `npm run identity:bootstrap`.
4. Confirma `development/gabinete_ucb` e introduce nombre, apellidos, correo y contraseña
   de la cuenta administradora. La contraseña se solicita dos veces y no se muestra.
5. Verifica en el editor SQL de Neon los conteos esperados: **1 cuenta, 5 roles,
   15 permisos y 18 concesiones de permiso a rol**.

La contraseña admite entre 15 y 128 caracteres Unicode, incluyendo espacios. Se usa
`PasswordHasher` de `@nestjs/authentication`, con scrypt y sus parámetros por defecto;
la biblioteca aplica NFKC internamente tanto al generar como al verificar el hash.
No se imprime ni almacena la contraseña en texto claro. Las pruebas usan un coste
menor exclusivamente para sus cuentas desechables.

Persona, cuenta, roles, permisos y concesiones se guardan en una sola transacción.
La auditoría utiliza el actor de sistema `bootstrap-first-admin` y una petición UUID,
porque la primera cuenta todavía no tiene una sesión humana. No se crea una sesión
de acceso durante la instalación. El administrador recibe únicamente los ocho
permisos de identidad definidos para él; no hereda funciones clínicas.

El comando requiere que las tablas de identidad estén vacías. Si encuentra una
cuenta o un catálogo parcial, se detiene sin sobrescribir datos. Dos ejecuciones
concurrentes no pueden crear dos administradores. No ejecutes la antigua plantilla
`03_bootstrap_primera_cuenta.sql` junto con este procedimiento.

La conexión propietaria es local: **no se configura en Render ni en el frontend**.
El backend web conserva su `DATABASE_URL` con `gabinete_app` y pooling. Este comando
no ejecuta migraciones, no modifica el esquema y no se ejecuta al arrancar el servidor.

## Pruebas por bloque

`npm run test:cov` ejecuta reglas y validación; `npm run test:e2e -- --coverage`
comprueba el contrato HTTP existente. `npm run build` seguido de `npm run test:db`
levanta PostgreSQL local temporal en Windows, prueba auditoría e inicialización y
detiene el servidor al finalizar. Requiere PostgreSQL 18 instalado; `PG_BIN` permite
indicar otra ubicación de sus binarios.

En GitHub, `npm run test:db:ci` utiliza exclusivamente el contenedor PostgreSQL del
workflow y `TEST_DATABASE_URL`. Nunca lee la conexión de Neon. La cobertura de estas
pruebas se publica en `coverage/postgres/lcov.info` y se importa en SonarCloud.

El siguiente bloque es autenticación y sesiones persistentes. Después siguen la
administración de cuentas con permisos, los flujos de activación y recuperación,
y las pantallas de React con pruebas integradas.

## Autenticación y migración incremental

El administrador inicial ya está instalado en el entorno actual. **No repitas
`identity:bootstrap` ni la migración `0000_baseline.sql` para continuar.**

1. Conserva `DATABASE_URL` del backend con el rol `gabinete_app` y pooling ON.
2. Conserva `MIGRATION_DATABASE_URL` sólo en `.env.migrations`, con el propietario
   y pooling OFF de `development / gabinete_ucb`. Usa `sslmode=verify-full`.
3. Desde `apps/backend`, ejecuta `npm run db:migrate` antes de desplegar este cambio.
   El comando verifica que el historial existente coincida con el repositorio y
   aplica únicamente las migraciones pendientes. Si el historial no coincide,
   se detiene: no borres las tablas ni ejecutes nuevamente el esquema inicial.
4. Verifica en Neon:

```sql
SELECT
  (SELECT count(*) FROM iam.account) AS account_count,
  (SELECT count(*) FROM iam.role) AS role_count,
  (SELECT count(*) FROM iam.permission) AS permission_count,
  (SELECT count(*) FROM iam.role_permission) AS grant_count,
  to_regclass('audit.security_event')::text AS security_events;
```

Antes de crear otras cuentas, los conteos siguen siendo `1 / 5 / 15 / 18`.
La tabla de eventos debe ser `audit.security_event`. El asistente sólo ha probado
esta actualización en PostgreSQL local temporal; la ejecución en Neon es manual.

Endpoints implementados:

| Método y ruta | Comportamiento |
| --- | --- |
| `POST /auth/sign-in` | Valida correo y contraseña; crea sesión persistente y cookie HttpOnly. |
| `GET /auth/me` | Devuelve identidad, roles y permisos vigentes de la sesión verificada. |
| `POST /auth/sign-out` | Revoca la sesión y elimina su cookie. |

La credencial aleatoria se almacena como SHA-256 en PostgreSQL. El UUID de sesión
es sólo un identificador de auditoría. La cookie usa `Secure` y prefijo `__Host-`
con `NODE_ENV=production`; en HTTP local usa un nombre sin ese prefijo. No se
devuelve el token en JSON ni se guarda en localStorage. Se aplican 30 minutos de
inactividad, ocho horas máximas y dos sesiones simultáneas por cuenta. Consultar
`/auth/me` o health no renueva la actividad. Cinco fallos por correo en quince
minutos bloquean temporalmente nuevos intentos; la verificación costosa de
contraseñas se limita a una por instancia y puede responder 503 para reintentar.

La sesión obtiene sus permisos actuales de PostgreSQL en cada petición. La
administración de cuentas, los guardas de permisos de esas operaciones y los
enlaces de activación/recuperación pertenecen al bloque siguiente.

## Cliente web y despliegue de este bloque

En el frontend local usa `VITE_API_URL=/api`. Vite reenvía `/api/*` al backend
local `http://localhost:3000/*`. Reinicia Vite después de editar su entorno.

En Render, en el **Static Site** del frontend:

1. Cambia `VITE_API_URL` a `/api`.
2. Añade una regla **Rewrite** con Source `/api/*` y Destination
   `https://gabinete-api-dev.onrender.com/*`, antes de cualquier regla `/*`.
3. Reconstruye y despliega el frontend. La URL de Vite se integra en la compilación.

En el Web Service del backend conserva `NODE_ENV=production` y configura
`CORS_ORIGINS` con `https://gabinete-web-dev.onrender.com` y, para el desarrollo
local, `http://localhost:5173,http://127.0.0.1:5173`. Esa lista explícita también
se utiliza como lista de orígenes de confianza de la protección CSRF de NestJS.
No añadas `MIGRATION_DATABASE_URL` ni una conexión de propietario a Render.

Después de aplicar la migración y desplegar ambos servicios, verifica desde el
frontend: ingresar con el administrador, recargar la página conservando la sesión,
salir y comprobar que ya no aparece la identidad. Verifica en las herramientas del
navegador que la cookie tiene HttpOnly y Secure. El proxy desplegado y esa prueba
en navegador siguen pendientes hasta efectuar estos pasos en Render.

Las pruebas unitarias, HTTP y PostgreSQL cubren credenciales inválidas, caducidad,
revocación, permisos vigentes, CSRF, límites, fallo de auditoría con rollback y
actualización de una instalación que ya tiene administrador. Las pruebas del
formulario usan Testing Library y Happy DOM como dependencias de desarrollo.
No acceden a Neon ni necesitan una contraseña real.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

To add it to this project, run this and approve the code it prints at [observe.nestjs.com/link](https://observe.nestjs.com/link) - signing up for free if you have no account:

```bash
$ npx @nestjs/observe link
```

It installs `@nestjs/observe`, wires it into `AppModule` and `main.ts`, and writes the app key and secret into `.env`, which every `nest start` script (`start`, `start:dev`, `start:debug`) then loads. In production, set `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` in the environment instead.

Or do it by hand:

```bash
$ npm install @nestjs/observe
```

Then follow the [setup guide](https://docs.nestjs.com/observability/sdk) - it takes a single import and an app key.

The free plan needs no payment details and covers 300,000 events a month. You can also browse the [live demo](https://www.observe-demo.nestjs.com/dashboard) first - the whole dashboard over a busy service's data, with nothing to install.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observe](https://observe.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
