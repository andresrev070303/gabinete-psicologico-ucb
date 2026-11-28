# Gestión de prácticas y horas

Un Auxiliar/pasante o Tesista con cuenta activa puede abrir **Mis actividades y horas** y trabajar
directamente. No requiere inscripción adicional, encargado ni supervisor. El
espacio de horas se prepara automáticamente, una sola vez por persona.

## Organización de la vista

**Mis actividades y horas** reúne el módulo con dos pestañas, sin apilar los dos paneles:

- **Actividades**: filas compactas con el trabajo a la izquierda y sus controles a la derecha. La actividad en curso se muestra primero, incluso si no pertenece a la página de actividades cargada. Retomar desaparece en esa fila y se sustituye por el contador y Detener; al detener, vuelve a estar disponible Retomar.
- **Registro de horas**: tabla y total de intervalos, con Eliminar, Editar y Retomar para el titular. El total queda junto a la cabecera del registro.

El contador conserva su referencia de reloj al cambiar de pestaña. No se reinicia ni añade consultas por segundo. Las pestañas admiten flechas, Inicio y Fin mediante teclado.

La vista del Director sólo muestra datos del practicante, registro y total. Se conserva la asignación de actividades en el directorio de practicantes.

## Crear, Play y actividades asignadas

**Crear** y **Play** abren el mismo modal con tres campos:

1. **Proyecto**: seleccionar uno existente o escribir un nombre nuevo.
2. **Actividad**: seleccionar una actividad de ese proyecto o escribir una nueva.
3. **Descripción**: describir el trabajo del intervalo, opcionalmente.

Al pulsar **Guardar e iniciar**, se inicia el cronómetro. Si se eligió una actividad
existente, se reutiliza su definición y se crea un intervalo nuevo; las horas
anteriores se conservan. Una actividad nueva se crea e inicia de forma atómica.
Las actividades asignadas por el Director aparecen entre las opciones del
estudiante, filtradas por proyecto y marcadas como asignadas por Dirección.

El modal no pide título adicional, tipo de actividad, cliente, etiquetas,
supervisor ni aprobación. «Actividad» corresponde al nombre del trabajo. Para
compatibilidad con los registros anteriores, el código conserva internamente una
clasificación; las actividades nuevas de este flujo usan `other`.

La Dirección abre **Practicantes** y ve las cuentas de Auxiliar/pasante y Tesista
en orden alfabético, aunque aún no tengan horas. **Crear actividad** abre el mismo
formulario con un campo adicional: **Practicante**. También puede usar **Asignar
actividad** en la fila de una persona. Esta operación prepara una actividad para
el destinatario; no inicia un cronómetro como si el Director fuera el estudiante.

Las cuentas pendientes de activar no pueden registrar tiempo. El Director puede
consultar los historiales existentes de personas que hayan dejado de estar activas.

## Registros y controles

Al pulsar **Detener**, ambos contadores se congelan inmediatamente. La solicitud envía `stoppedAt` ajustado al reloj recibido del servidor; se valida que sea posterior al inicio, no anterior a cinco minutos ni más de cinco segundos futuro respecto del servidor. Un desfase futuro tolerado se limita al reloj del servidor. El tiempo de recarga no aumenta el intervalo; un reintento conserva el cierre ya guardado. Si falla la detención se informa que no se confirmó y se vuelve a consultar el cronómetro, sin afirmar que se guardó.

Al confirmar el cierre, se guarda el intervalo y se incorpora al total. La tabla
muestra fecha, inicio, fin, duración, proyecto y actividad/descripción. El registro
manual fue retirado de la interfaz y de la API. Los registros anteriores se conservan. **Retomar tarea** inicia directamente un nuevo intervalo, sin abrir un modal.

El total suma todos los intervalos finalizados y no anulados, aunque no estén en
la página visible. Se presenta en horas y minutos completos. Un cronómetro activo
muestra su duración, pero se suma al total cuando se detiene. Los horarios se
presentan en Bolivia (`America/La_Paz`).

Se impiden intervalos superpuestos, tiempo futuro y cronómetros simultáneos por
persona. El inicio se guarda en PostgreSQL: recargar o reiniciar el backend no lo
pierde. Los reintentos usan identificadores estables; repetir una detención no
agrega tiempo. Inicio, fin y duración no son editables. El servidor y PostgreSQL rechazan alteraciones de esas horas; sólo un cronómetro en curso puede establecer su fin al detenerse.

Los estados de la práctica son **Activa** y **Finalizada**. El Director puede
finalizarla o reabrirla con motivo; una práctica finalizada conserva sus horas y
consulta, pero no admite trabajo nuevo hasta reabrirse. La preparación automática
no reactiva una práctica finalizada. No se puede finalizar con un cronómetro activo.

Las ediciones y eliminaciones conservan versión, valores anteriores, motivo,
cuenta, sesión y solicitud verificadas por el servidor. No hay aprobación de horas
ni eliminación física de registros.

## Acciones de cada fila

En la vista del estudiante, la columna Acciones ofrece **Eliminar**, **Editar** y **Retomar**. La tabla del Director es de consulta, sin columna Acciones ni botones deshabilitados. No hay botón Historial.

- **Editar** abre el mismo modal con Proyecto, Actividad y Descripción precargados. Sólo cambia ese intervalo; no renombra los demás registros ni altera inicio, fin o duración. Si se elige una actividad existente se utiliza su definición; si se escribe una nueva se crea una definición en la misma práctica. La versión evita sobrescribir cambios concurrentes.
- **Retomar** inicia directamente otro intervalo con los datos del registro elegido. Conserva el intervalo original y no abre modal. Está disponible sólo al titular con permiso de registro, práctica activa y sin otro cronómetro; Dirección no registra tiempo en nombre del estudiante.
- **Eliminar** pide confirmación, realiza borrado lógico, retira la fila de la lista y descuenta su duración del total. No elimina físicamente datos ni auditorías. Si estaba en curso también desaparece del cronómetro después de confirmar el guardado.

El estudiante sólo puede editar/eliminar su propio registro mientras su práctica esté activa. Dirección y los perfiles de consulta no pueden editar, eliminar ni retomar horas de otra persona; la API también rechaza estas operaciones. La asignación de actividades y el estado de la práctica se administran desde el directorio, fuera de la consulta de horas. La auditoría interna conserva cuenta, sesión, solicitud y los datos anteriores; no se muestra como opción de la tabla.

## Permisos y arquitectura

El estudiante crea, retoma, detiene y consulta exclusivamente su propio trabajo. No puede cambiar el estado de actividades ni escribir manualmente inicio/fin; esos cambios se rechazan también en el backend. El Director
consulta los mismos registros y totales y puede asignar actividades, cambiar el
estado de la práctica. Sus permisos de gestión no permiten modificar los intervalos del estudiante. El Administrador técnico no
obtiene acceso a estas horas.

Los vínculos históricos de supervisión se conservan como datos opcionales. Un
Psicólogo con el permiso correspondiente puede consultar únicamente esos vínculos
anteriores; no recibe acceso general a todos los practicantes.

Se mantiene el monolito modular por dominio y capas con REST síncrono:
`src/modules/practicum/{domain,application,infrastructure,presentation}`.
Repository, Unit of Work e inyección de dependencias mantienen los casos de uso
separados de HTTP/PostgreSQL y su auditoría dentro de cada transacción.

`POST /practicum/my-placement` prepara idempotentemente el espacio del usuario
autenticado; rechaza identidades enviadas en el cuerpo. `GET
/practicum/practitioners` permite al Director consultar el directorio, incluyendo
personas que todavía no han registrado tiempo. La interfaz usa un único
`ActivityDialog`, con diálogo nativo, selectores propios con lista visible y navegación por teclado, y el mismo componente de horas para ambas vistas. Actividades y horas comparten pantalla; no hay formulario de estado de actividades.

El frontend continúa en español y el código en inglés. `/api` y las cookies
existentes se conservan. El contador avanza localmente cada segundo; no consulta
la base cada segundo. Las listas se actualizan al abrir, guardar, enfocar la
ventana o pulsar **Actualizar horas**. No hay notificaciones instantáneas entre cuentas.

«Proyecto» es el contexto de la actividad de práctica, sin crear automáticamente
un proyecto, taller o convenio institucional. Actividades institucionales sigue
siendo un módulo separado. Registrar tiempo de atención no concede acceso a
expedientes clínicos.

## Actualizar Neon

Este ajuste de organización visual y permisos de consulta no añade migraciones. Si `0007` ya fue aplicada, sólo reinicia o despliega ambos servicios.

La última migración es `0007_entry_details_actions.sql`: permite editar los datos descriptivos del registro, protege inicio y fin y agrega las instantáneas anteriores de proyecto y actividad a la auditoría. Conserva todos los registros, incluso los eliminados lógicamente. No se modifican las migraciones
anteriores ni se necesita registrar manualmente al estudiante mediante SQL.

1. Conserva **development / gabinete_ucb**.
2. En `apps/backend/.env.migrations`, conserva `MIGRATION_DATABASE_URL` con
   **neondb_owner**, conexión directa, **pooling OFF** y `sslmode=verify-full`.
3. Desde `apps/backend`, ejecuta:

   ```powershell
   npm run db:migrate
   ```

   El comando aplica las migraciones pendientes en orden. No repitas
   `identity:bootstrap`, no pegues el esquema inicial y no uses `drizzle-kit push`.

4. En SQL Editor comprueba:

   ```sql
   SELECT count(*) AS migration_count FROM drizzle.__drizzle_migrations;

   SELECT column_name, is_nullable
   FROM information_schema.columns
   WHERE table_schema = 'practicum' AND table_name = 'placement'
     AND column_name IN ('term_id', 'placement_kind', 'supervisor_account_id');

    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'practicum' AND table_name = 'time_entry_revision'
      AND column_name IN ('previous_task_id', 'previous_task_title', 'previous_project_label');
   ```

   Se esperan **ocho migraciones** y `YES` en las tres columnas. El catálogo de
   prácticas mantiene sus cuatro permisos y seis concesiones. La segunda consulta debe devolver las tres columnas de práctica; la tercera, las tres nuevas columnas de auditoría.

`DATABASE_URL` del backend local y de Render sigue con **gabinete_app** y pooling
**ON**. `VITE_API_URL=/api`, el proxy y los demás ajustes no cambian. No se añaden
servicios, paquetes o pagos. Las migraciones se probaron sólo con PostgreSQL local;
aplicarlas en Neon es un paso del usuario.

Si vienes de una versión antigua con varias prácticas de una misma persona, la
migración `0005` pendiente requiere revisar esos historiales antes de consolidarlos;
no borres datos o el historial de migraciones para forzar la actualización.

## Prueba del flujo

1. Aplica la migración y reinicia backend y frontend.
2. Ingresa como un estudiante activo que nunca haya sido registrado en prácticas.
   **Mis actividades y horas** debe mostrar la tabla y los botones **Crear** y **Play**, sin
   solicitar autorización, encargado o supervisor.
3. Crea un proyecto/actividad con descripción y pulsa **Guardar e iniciar**.
   Recarga y comprueba que el cronómetro continúa. Detén el trabajo.
4. Pulsa **Retomar tarea** en una actividad; debe iniciar directamente. Detén y comprueba que ambos contadores se congelan antes de terminar la recarga. También puedes abrir Play y seleccionar el proyecto y actividad desde listas desplegables.
   Se deben conservar ambos intervalos.
5. Director → **Practicantes → Crear actividad**: elige estudiante, proyecto,
   actividad y descripción. El destinatario debe verla en sus opciones al abrir
   Crear o Play. Al seleccionarla se recupera su descripción.
6. Cambia a **Registro de horas**. En una fila pulsa **Editar**, modifica los tres campos y comprueba que las horas no cambian. **Retomar** debe iniciar otro intervalo y **Eliminar** debe quitar la fila y actualizar el total, después de confirmar.
7. Director → **Ver horas**: mismos registros y total, sin acciones para modificar intervalos y sin aprobación. Una segunda
   cuenta de estudiante sólo debe ver sus propios registros.

Después de probar, publica con el commit/push y despliegue de Render existentes.
No uses la conexión de propietario en Render ni ejecutes migraciones de propietario
al arrancar el servidor. Mantén datos ficticios durante el desarrollo.
