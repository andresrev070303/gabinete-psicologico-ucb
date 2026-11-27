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

## Estado y siguiente paso en development

El usuario confirmó la habilitación del Director. Este bloque completa la gestión
operativa de Psicólogos, Auxiliares y Estudiantes de Titulación, la administración
del propio acceso y la consulta de auditoría de identidad.

Desde `apps/backend`, ejecuta `npm run db:migrate` con la conexión de propietario
directa, pooling OFF y `sslmode=verify-full` en `.env.migrations`. La migración nueva
es `0003_identity_lifecycle.sql`: añade auditoría semántica de identidad y concede
los privilegios correspondientes al rol de ejecución. Conserva las cuentas y el
catálogo. El backend sigue con `gabinete_app` y pooling ON. No repitas el bootstrap.

El asistente sólo probó las migraciones con PostgreSQL temporal local. Aplicarlas
en Neon y desplegar el código siguen siendo acciones del usuario. Verifica:

```sql
SELECT to_regclass('audit.identity_event')::text AS identity_events;
SELECT count(*) AS applied_migrations FROM drizzle.__drizzle_migrations;
```

Los resultados esperados tras esta versión son `audit.identity_event` y cuatro
migraciones. Los catálogos siguen con cinco roles, 15 permisos y 18 concesiones;
el número de cuentas aumenta al crear personas del equipo.

Reinicia ambos procesos y prueba con datos ficticios:

1. Ingresa como Director. Para administrar accesos, la contraseña debe haberse
   verificado hace menos de diez minutos; vuelve a ingresar si es necesario.
2. En **Accounts / Invite an operational account**, registra nombre, apellidos,
   correo y los roles operativos elegidos expresamente.
3. Con el modo manual predeterminado, abre el enlace en otro perfil de navegador
   sin una sesión previa. Establece la contraseña del destinatario y luego ingresa
   con su correo. La invitación dura 24 horas y sólo admite una activación.
4. Comprueba que un Psicólogo puede gestionar su propio acceso, pero no listar
   cuentas ajenas. Repite para Auxiliar y Titulación.
5. Con el Director, usa **Manage account** para corregir nombres/teléfono, cambiar
   roles, emitir recuperación, deshabilitar o reincorporar. El correo de acceso no
   se modifica en este primer módulo. La baja pide motivo y conserva el historial.
6. Al cambiar roles o deshabilitar, las sesiones anteriores dejan de autorizar.
   Reincorporar exige roles nuevos y otra activación; no revive concesiones previas.
7. En cualquier cuenta, abre **Manage my access**: cambia el teléfono, consulta o
   revoca sesiones propias y cambia la contraseña demostrando la actual. El cambio
   revoca todas las sesiones y vuelve a la pantalla de ingreso.
8. Director y Administrador pueden abrir **Show identity audit**. El Director ve
   cuentas operativas administrables y sus propias acciones; el Administrador ve
   identidad. Sólo se muestran metadatos, campos modificados y motivos, nunca sus
   valores anteriores, contraseñas, hashes ni secretos. El UUID de sesión es un
   identificador de atribución, no una credencial.

El Administrador conserva las operaciones especiales sobre candidatos y Directores:
invitación sin rol, activación, designación explícita, suspensión, recuperación y
reincorporación. Activar o reincorporar un candidato no lo designa Director.
Sólo puede existir una concesión directiva vigente. El Director no controla cuentas
que tengan historial de Administrador o Director, ni su propia cuenta.

## Correo desde Gmail mediante HTTPS

Remitente confirmado: **gabinetepsicologicoucb@gmail.com**. La integración está
implementada; el envío real requiere autorización OAuth de esa cuenta. Las pruebas
usan respuestas simuladas y no envían correos. No se incorpora un proveedor de pago.

El backend admite dos modos mediante `IDENTITY_EMAIL_MODE`:

- `manual` (predeterminado para las pruebas): devuelve el enlace una sola vez al
  operador autorizado. No contacta a Google ni requiere secretos de correo.
- `gmail`: envía mediante Gmail API por HTTPS, después del commit. El enlace no se
  devuelve ni se muestra al operador, incluso si falla el proveedor. La respuesta
  distingue envío aceptado y fallo; un fallo conserva la cuenta pendiente y permite
  emitir otro enlace tras revisar la configuración. No hay reintentos automáticos
  que puedan duplicar un envío de resultado incierto.

Gmail aceptando un mensaje no garantiza su llegada a la bandeja principal; comprueba
el buzón y spam durante la aceptación. Las recuperaciones duran una hora y las
invitaciones 24 horas. Reemitir revoca el enlace anterior. La recuperación no inicia
sesión automáticamente y revoca las sesiones existentes al confirmar la contraseña.

Configuración manual del remitente, sin compartir secretos en el chat:

1. Con la cuenta remitente, crea un proyecto propio en Google Cloud Console y
   habilita **Gmail API**. No habilites facturación, pruebas de pago ni servicios
   adicionales para seguir estos pasos.
2. Configura Google Auth Platform / OAuth para el proyecto de desarrollo. Si usas
   audiencia **External / Testing**, añade únicamente el remitente como test user.
   Los destinatarios del Gabinete no necesitan autorizar Google: sólo el remitente.
3. Solicita únicamente `https://www.googleapis.com/auth/gmail.send`. No se necesita
   leer el correo ni acceder a toda la cuenta de Gmail.
4. Crea un cliente OAuth de tipo **Web application** y registra como redirect URI
   `https://developers.google.com/oauthplayground`.
5. En el OAuth Playground oficial, abre la configuración, selecciona **Google**,
   **Server-side**, **Offline** y **Use your own OAuth credentials**. Introduce tu
   client ID y client secret allí, sin enviarlos al chat. Usar credenciales propias
   evita la revocación de 24 horas de los tokens del cliente público del Playground.
6. Autoriza sólo el scope del paso 3 con la cuenta remitente. Intercambia el código
   y copia el **refresh token** directamente al entorno privado del backend.
7. Usa `identity-email.env.example` como plantilla. En el backend local y luego en
   Render configura `GMAIL_SENDER`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
   `GMAIL_REFRESH_TOKEN` e `IDENTITY_PUBLIC_URL`. Para Render, esta última es
   `https://gabinete-web-dev.onrender.com/`. Para una prueba local puede ser
   `http://localhost:5173/`, que sólo abre en la máquina del destinatario.
8. Cambia `IDENTITY_EMAIL_MODE=gmail`, reinicia el backend y crea una invitación
   ficticia hacia un buzón de pruebas bajo tu control. Verifica recepción, vencimiento,
   activación de un solo uso y que la pantalla del operador no contiene el enlace.

En **External / Testing**, Google hace caducar el refresh token a los siete días
para este scope. Si deja de funcionar, autoriza otra vez y reemplázalo; no lo
confundas con el vencimiento de una invitación. Antes de uso institucional continuo,
configura la publicación y verificación aplicables a la audiencia. Google documenta
excepciones para audiencia limitada y un modo Personal restringido al creador;
Personal es una elección irreversible y no debe elegirse sin considerar la futura
transferencia institucional del remitente.

El correo usa un adaptador pequeño de Gmail API con `fetch` y OAuth; se revisó el
paquete oficial de correo de NestJS, cuyos transportes documentados no incluyen
Gmail API. No se añade una dependencia sólo para envolver este adaptador.

Fuentes: [restricciones de SMTP en Render Free](https://render.com/docs/free),
[envío Gmail API](https://developers.google.com/workspace/gmail/api/guides/sending),
[scopes](https://developers.google.com/workspace/gmail/api/auth/scopes),
[OAuth Playground](https://developers.google.com/oauthplayground/),
[caducidad de refresh tokens](https://developers.google.com/identity/protocols/oauth2#expiration),
[audiencia y excepciones](https://support.google.com/cloud/answer/13464323?hl=en).

## Arquitectura y decisiones de implementación

Se conserva el monolito modular por dominios con capas internas. `presentation`
valida HTTP y aplica políticas explícitas; `application` coordina casos de uso
mediante contratos; `domain` contiene las reglas puras de roles y alcance;
`infrastructure` implementa transacciones PostgreSQL y la entrega por Gmail.
React consume REST/HTTPS; la llamada externa a Gmail usa HTTPS y no convierte
los módulos del backend en servicios distribuidos.

La inyección de dependencias permite sustituir repositorio y entrega en pruebas.
El adaptador de correo mantiene las reglas de cuentas independientes del proveedor.
Las políticas verifican permiso, propiedad, estado e historial. Las mutaciones
administrativas se serializan con el bloqueo compartido ya existente y revalidan
sesión, rol y permisos dentro de la transacción auditada. No se añaden colas ni JWT.

La recuperación de emergencia del Administrador queda bajo custodia del propietario
institucional de la base; no se añade una ruta web para elevar, eliminar o recuperar
al Administrador desde otra cuenta. Antes de entregar el sistema debe documentarse
y ensayarse ese procedimiento de emergencia con el custodio.

## Instalación inicial en una base vacía

Este bloque instala el catálogo aprobado de identidad y la primera cuenta
administradora. Se utiliza exclusivamente al instalar en una base vacía.

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

Las pruebas cubren habilitación directiva, gestión operativa, recuperación,
sesiones propias, auditoría con alcance, concurrencia y rollback. La entrega Gmail
se prueba con HTTP simulado; falta autorizar el remitente y probar la recepción real.

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
| `GET /accounts` | Lista paginada de metadatos; Administrador ve identidad general y Director sólo cuentas operativas administrables. |
| `GET /roles` | Consulta del catálogo activo predefinido; sin edición de roles o permisos. |
| `POST /accounts/director-invitations` | Crea una cuenta pendiente y un enlace de activación; exige permiso y autenticación reciente del Administrador. |
| `POST /auth/activations` | Establece la contraseña y consume el enlace atómicamente; 204 sin cookie de navegación. |
| `POST /accounts/:id/director-assignment` | Designa o sustituye al Director con historial y revocación de sesiones; 204. |
| `POST /accounts/operational-invitations` | Invita personal con roles operativos predefinidos; 201. |
| `PATCH /accounts/:id/profile` | Corrige nombres y teléfono dentro del alcance; 204. |
| `PUT /accounts/:id/roles` | Reemplaza expresamente los roles operativos y revoca sesiones; 204. |
| `POST /accounts/:id/disable` | Baja lógica con motivo, revocación de sesiones, roles y enlaces; 204. |
| `POST /accounts/:id/reinvitations` | Nuevo enlace y roles seleccionados; no revive accesos; 201. |
| `POST /accounts/:id/password-reset-invitations` | Recuperación de un solo uso dentro del alcance; 201. |
| `GET /auth/sessions` | Sólo sesiones interactivas propias todavía utilizables. |
| `POST /auth/sessions/:id/revocations` | Revoca una sesión propia; 204. |
| `POST /auth/password-change` | Verifica la contraseña actual, cambia y revoca sesiones; 204. |
| `GET, PUT /auth/contact` | Lee o actualiza sólo el teléfono propio. |
| `GET /identity-audit` | Metadatos de identidad paginados con alcance aplicado en SQL. |


La credencial aleatoria se almacena como SHA-256 en PostgreSQL. El UUID de sesión
es sólo un identificador de auditoría. La cookie usa `Secure` y prefijo `__Host-`
con `NODE_ENV=production`; en HTTP local usa un nombre sin ese prefijo. No se
devuelve el token en JSON ni se guarda en localStorage. Se aplican 30 minutos de
inactividad, ocho horas máximas y dos sesiones simultáneas por cuenta. Consultar
`/auth/me` o health no renueva la actividad. Cinco fallos por correo en quince
minutos bloquean temporalmente nuevos intentos; la verificación costosa de
contraseñas se limita a una por instancia y puede responder 503 para reintentar.

La sesión obtiene sus permisos actuales de PostgreSQL en cada petición. La
autorización de rutas utiliza `@nestjs/authorization` y políticas explícitas, sin
una excepción universal para el Administrador. Las mutaciones bloquean y vuelven
a verificar actor, sesión, permisos y destinatario en la misma transacción que
modifica los datos. La activación usa una sesión interna cerrada para atribuir el
cambio al destinatario que demostró poseer el enlace. Los hashes de contraseña y
los secretos no se incluyen en las respuestas del listado ni en la auditoría de valores.

El código mantiene las capas `presentation`, `application`, `domain` e
`infrastructure` dentro de `identity`. Las reglas de elegibilidad están en dominio;
los casos de uso y contratos en aplicación; las consultas y transacciones en el
adaptador PostgreSQL; las validaciones HTTP, estados y filtros en presentación.
Se comparte un limitador de trabajo de contraseñas entre ingreso y activación
para conservar el presupuesto de memoria de la instancia gratuita.

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
