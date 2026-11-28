# Gestión institucional y notificaciones

El módulo permite al Director crear talleres, charlas, campañas, capacitaciones, reuniones, investigaciones, otros eventos, convenios y proyectos/programas desde un único formulario. El código está en inglés y la interfaz en español. El nombre de menú inicial es **Gestión institucional**.

## Modelo y flujo

- Una actividad tiene fecha/hora en Bolivia, lugar, descripción, responsable y equipo. Puede vincularse opcionalmente con un proyecto y/o convenio. Su duración programada se calcula a partir del horario.
- Un convenio representa un acuerdo con una institución obligatoria, código opcional, descripción, responsable y vigencia. Es un registro administrativo del acuerdo; la firma y los adjuntos quedan fuera de esta entrega.
- Un proyecto/programa agrupa actividades y conserva su objetivo, responsable, código opcional y fechas opcionales. No es obligatorio crear un proyecto para registrar un evento.
- El responsable es una cuenta activa de Director o Psicólogo. El equipo puede incluir cuentas activas de Director, Psicólogo, Auxiliar/pasante y Tesista. No se crean nuevas cuentas desde este formulario.
- Las personas del equipo son distintas de los asistentes/beneficiarios externos. Por ahora, marcar como realizada una actividad no solicita resultados ni cantidad de asistentes. Los campos existentes se conservan como datos opcionales; una cantidad no registrada permanece nula, sin inventar un cero.

El desplegable adapta el formulario sin mezclar el horario de un evento con la vigencia de un convenio. Dirección puede añadir una institución desde el propio formulario. La lista reúne todos los tipos con un único buscador por nombre o institución y paginación por cursor. No muestra filtros de tipo, estado ni fechas.

«Otro» aparece al final del selector de registros y «Otra» al final del tipo de institución. Para actividades, inicio y fin tienen dos campos separados: **Fecha** y **Hora**. La hora utiliza `HH:mm`, de `00:00` a `23:59`, e inserta los dos puntos al escribir (`1500 → 15:00`). Los minutos excedentes se acumulan a la hora (`15:60 → 16:00`); se rechazan horas mayores que 23 y acarreos que pasarían al día siguiente, sin modificar la fecha. No hay selector AM/PM. El horario se interpreta en Bolivia y se envía a la API en UTC. Al editar se precargan la fecha y hora de Bolivia del registro existente; la lista y el detalle también muestran las horas en formato de 24 horas. El fin es opcional, pero al completarlo requiere tanto fecha como hora. Convenios y proyectos conservan fechas de vigencia sin hora. Este ajuste no requiere una migración adicional.

Estados:

- Actividad: programada → finalizada (estado interno `completed`), mediante confirmación simple después de su inicio. Los botones aparecen como **Finalizar**, **Editar**, **Eliminar**. Después de finalizar quedan **Editar** y **Eliminar**; editar no reabre la actividad y conserva su estado finalizado, versión y auditoría. No se permite cambiar su inicio a una fecha futura.
- Proyecto: planificado → en curso, finalizado o cancelado; en curso → finalizado o cancelado.
- Convenio: borrador → activo o cerrado; activo/vencido → cerrado. Un convenio activo cuya fecha final ya pasó se presenta y filtra como vencido, calculado en Bolivia; no requiere un cron.

Los cambios usan versión para rechazar ediciones concurrentes. El borrado es lógico y conserva auditoría. No se puede eliminar un proyecto o convenio con actividades no eliminadas vinculadas, ni cambiar la institución de un convenio si contradice esas actividades.

Las confirmaciones no solicitan campos adicionales: la operación queda descrita automáticamente en el motivo de auditoría, con cuenta, sesión y solicitud verificadas en el backend. Eliminar asigna `deleted_at`, oculta el registro y conserva su estado previo; no lo convierte en realizado/finalizado. La interfaz ofrece finalizar proyectos/convenios y marcar actividades como realizadas, además de eliminar. Las transiciones de cancelación existentes en la API se conservan por compatibilidad, sin botones en esta vista.

## Permisos

| Perfil                                                                  | Acceso                                                                                                                      |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Director con `institutional.manage`                                     | Crear, editar, asignar equipo, cambiar estados, registrar resultados, eliminar lógicamente y consultar todos los registros. |
| Psicólogo, Auxiliar/pasante o Tesista con `institutional.read_assigned` | Consultar únicamente los registros de cuyo equipo forman parte.                                                             |
| Administrador técnico                                                   | Sin acceso a registros institucionales.                                                                                     |

La primera entrega concentra las modificaciones en Dirección. El Psicólogo responsable puede consultar el registro; una futura delegación de edición requerirá permisos explícitos. Conocer el identificador o recibir un aviso anterior no concede acceso después de ser retirado del equipo.

## Notificaciones internas

Agregar una cuenta al equipo crea un aviso persistente en su campana. Incluye el nombre de quien la añadió, el tipo y el nombre del registro. Se incluye automáticamente al responsable. Dirección no recibe avisos por agregarse a sí misma.

Asignación y aviso se insertan en una sola transacción PostgreSQL. Repetir la creación con el mismo identificador y los mismos datos no duplica el registro ni los avisos; editar el equipo no vuelve a avisar a quienes ya pertenecen a él. Retirar y volver a incluir una persona genera una asignación y aviso nuevos.

La campana se actualiza al iniciar sesión, recuperar el foco, abrirse, pulsar Actualizar y cada 60 segundos mientras la pestaña está visible. No usa WebSockets ni promete entrega instantánea. El destinatario puede abrir el registro y marcar el aviso como leído; solo él puede modificar esa marca. La lista de avisos está paginada y el contador corresponde a todos sus avisos sin leer.

Las consultas de avisos no prolongan el tiempo de inactividad de la sesión. Abrir un registro o confirmar una lectura son acciones del usuario; una pestaña abierta que solamente consulta avisos sigue respetando el vencimiento por inactividad.

Los avisos permanecen si después se retira la participación o se elimina el registro. Abrirlos vuelve a comprobar permisos y puede indicar que el registro ya no está disponible. No se envían correos ni se modifica la configuración de Gmail.

## Arquitectura

Se mantiene el monolito modular por dominios y capas internas con API REST síncrona:

```text
src/modules/institutional/{domain,application,infrastructure,presentation}
src/modules/notifications/{domain,application,infrastructure,presentation}
```

Los contratos describen entradas, respuestas y la frontera de persistencia. Las reglas de fechas, permisos y transiciones no dependen de React, HTTP ni PostgreSQL. Los controladores validan entradas y delegan; el repositorio contiene consultas parametrizadas y autorización por asignación. Repository, Unit of Work e inyección de dependencias siguen los mecanismos ya usados por el proyecto.

El módulo de notificaciones exporta únicamente su escritor de infraestructura para participar en la transacción del módulo institucional. No se añade un bus de eventos, cola ni servicio externo. La auditoría conserva cuenta, sesión y solicitud verificadas. Se reutilizan `projects.activity`, `projects.project`, `projects.agreement` y `core.institution`; se agregan el equipo interno y los avisos personales.

Esta entrega mantiene el registro de prácticas separado: incluir a alguien no crea intervalos ni inicia cronómetros. Las tareas y horas existentes siguen funcionando. El enlace explícito entre tareas de prácticas y un registro institucional, los adjuntos y los reportes agregados quedan para una ampliación.

## Actualizar Neon

La nueva migración es `0008_institutional_management.sql`. No modifica las migraciones 0000–0007 ni reemplaza cuentas o registros existentes.

1. Conserva `development / gabinete_ucb` y la conexión de propietario `neondb_owner`, directa, pooling OFF, `sslmode=verify-full`, en `.env.migrations`.
2. Desde `apps/backend`, ejecuta:

   ```powershell
   npm run db:migrate
   ```

3. Comprueba en SQL Editor:

   ```sql
   SELECT count(*) AS migration_count FROM drizzle.__drizzle_migrations;
   SELECT to_regclass('projects.institutional_team') AS team_table,
          to_regclass('iam.user_notification') AS notification_table;
   SELECT code FROM iam.permission
   WHERE code IN ('institutional.manage','institutional.read_assigned','notifications.read_own')
   ORDER BY code;
   ```

   Se esperan nueve migraciones, ambas tablas y los tres permisos. La migración instala ocho concesiones nuevas sobre los roles existentes. No vuelvas a ejecutar el bootstrap del administrador.

4. Reinicia backend y frontend, cierra sesión e ingresa de nuevo para actualizar los menús del frontend.

`DATABASE_URL` continúa usando `gabinete_app` con pooling ON. No agregues la conexión del propietario a Render. No hay variables nuevas; se conserva `VITE_API_URL=/api`. Para el despliegue existente, aplica la migración antes de publicar ambos servicios actualizados.

En una instalación completamente nueva, el bootstrap instala el catálogo institucional después del catálogo de identidad y prácticas. El total inicial pasa a 22 permisos y 32 concesiones; no se utiliza ese bootstrap para actualizar instalaciones existentes.

## Comprobación funcional

1. Como Director, abre Gestión institucional → Crear. Selecciona Charla, asigna un auxiliar o tesista y guarda sin proyecto ni convenio.
2. En otra cuenta de ese equipo, comprueba la campana y abre el aviso. Recarga o inicia sesión nuevamente: el aviso conserva su estado de lectura.
3. Con una cuenta que no pertenezca al equipo, comprueba que no se ve el registro ni se puede abrir por identificador.
4. Como Director, crea un proyecto y un convenio con una institución. Crea un taller y vincúlalo con ambos. Comprueba sus actividades relacionadas.
5. Agrega una persona más: solo ella recibe un aviso nuevo. Retírala del equipo y comprueba que pierde acceso al registro.
6. Para una actividad pasada, pulsa Finalizar y confirma sin completar otros campos. Comprueba que desaparece Finalizar y permanecen Editar y Eliminar. Edita una descripción y comprueba que sigue finalizada. Eliminar un registro de prueba lo retira de la lista y conserva su estado previo, sus datos y su auditoría.

Las pruebas automatizadas usan PostgreSQL temporal local y datos ficticios. Esta documentación no implica que la migración haya sido aplicada en Neon ni que se haya publicado el código.
