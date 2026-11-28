# Gabinete UCB — Frontend

Aplicación React + TypeScript + Vite del Gabinete de Servicios Psicológicos.
La interfaz está en español; los identificadores y contratos de código están en inglés.

## Desarrollo local

Desde esta carpeta:

```powershell
npm ci
npm run dev -- --port 5173 --strictPort
```

Configura `VITE_API_URL=/api` en tu archivo `.env` local, usando `.env.example` como referencia.
El proxy de Vite reenvía `/api` al backend local en `http://localhost:3000`.
En Render conserva la configuración existente del proxy y las cookies de sesión.
Las variables `VITE_*` son públicas: no deben contener contraseñas, tokens ni credenciales de Neon.

## Organización

- `src/components`: marca, iconos y composición visual compartida.
- `src/features/auth`: presentación y estado del acceso; utiliza el cliente HTTP existente.
- `src/features/accounts`: invitaciones, activación, administración, sesiones y auditoría.
- `src/features/practicum`: prácticas, tareas, cronómetro y registros de horas.
- `src/features/agenda`: calendario mensual de consulta, sin citas ni operaciones sobre registros.
- `src/features/workspace`: estructura autenticada, navegación por perfil y composición de pantallas.
- `src/lib`: cliente HTTP y funciones de presentación en español.
- `src/styles`: colores, tipografía, componentes y adaptación a pantallas pequeñas.

Esta organización corresponde a la presentación del sistema cliente-servidor con backend monolítico modular por dominio y capas, comunicado mediante REST/HTTPS. Los componentes reutilizan los contratos y clientes API actuales; las reglas de negocio y la autorización se mantienen en el backend.

## Perfiles y alcance visual

| Perfil existente   | Vista preparada                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| Administrador      | Dirección del Gabinete, auditoría autorizada y estado del servicio                                      |
| Director           | Usuarios autorizados, practicantes, actividades institucionales, agenda, casos, evaluaciones y reportes |
| Psicólogo          | Agenda, casos, evaluaciones y supervisiones                                                             |
| Auxiliar / pasante | Mis actividades y horas, práctica y casos asignados                                                     |
| Tesista            | Proyecto, Mis actividades y horas, práctica y documentos                                                |

Los menús de cuentas y auditoría requieren los permisos recibidos de la API. Una cuenta con varios perfiles combina sus menús sin duplicarlos. Ocultar controles en el frontend no sustituye la autorización del backend.

Pasante es una denominación de práctica dentro del perfil auxiliar existente; este rediseño no agrega un sexto rol de seguridad.

Usuarios, invitaciones, activación, mi cuenta y auditoría utilizan sus operaciones actuales. Prácticas ya utiliza la API: el estudiante registra tiempo y el Director consulta los mismos registros y totales, sin aprobación. El Psicólogo puede consultar sus prácticas supervisadas. Gestión institucional utiliza su API y los demás módulos futuros muestran **Próximamente**, sin simular guardados.

**Mi agenda** muestra un calendario mensual para los perfiles que ya incluyen ese menú (Director y Psicólogo). Permite avanzar y retroceder meses, volver a Hoy y reconocer la fecha actual de Bolivia. Las semanas empiezan en lunes. Es un calendario de consulta, sin citas, eventos, solicitudes HTTP ni cambios en Neon.

Antes de probar prácticas, aplica la migración del backend siguiendo la [guía de Neon y prácticas](../backend/docs/practicum.md). No se agregan variables de entorno ni cambia `VITE_API_URL=/api`.

El estudiante abre **Mis actividades y horas** directamente, sin inscripción adicional ni supervisor.
**Crear** y **Play** abren el mismo modal con Proyecto, Actividad y Descripción;
admite opciones nuevas y actividades asignadas por Dirección. El Director ve el
directorio de practicantes y puede asignar con el mismo modal, seleccionando al
destinatario. Se necesita la migración `0007_entry_details_actions.sql`. Proyecto y Actividad usan listas desplegables propias con búsqueda y teclado. Retomar inicia directamente. Actividades y Registro de horas se presentan en pestañas. Las actividades son filas compactas: la activa se fija primero y cambia Retomar por el contador y Detener a la derecha. Las filas de horas del estudiante muestran Eliminar, Editar y Retomar. El Director sólo ve registros y totales, sin columna Acciones; la asignación permanece en el directorio. No hay migraciones posteriores a `0007` para este ajuste. Editar abre Proyecto, Actividad y Descripción sin campos de hora; Eliminar pide confirmación y conserva el borrado lógico. Historial se retira de la interfaz y se conserva la auditoría interna. Se retira el registro manual y el formulario de estado de actividades. Stop congela el contador y el de la tabla al pulsarlo, con confirmación del servidor y recuperación visible si falla.

El acceso continúa siendo por invitación. La ayuda del login explica cómo contactar al responsable; no ofrece registro público ni una recuperación pública inexistente.

## Estilo y accesibilidad

Paleta: amarillo `#FFC145`, celeste `#2D9CDB`, azul `#1B4F72`, crema `#FDF6E3` y texto `#2C3E50`. Incluye estados de error, foco visible, etiquetas de campos, mostrar/ocultar contraseña, enlace para saltar al contenido y menú móvil con diálogo nativo.

El símbolo de la aplicación es propio de esta interfaz y no representa un logotipo oficial de la universidad. No se incorporan fuentes externas ni bibliotecas nuevas.

## Verificación

```powershell
npm run lint
npm test
npm run test:cov
npm run build
```

Las pruebas usan respuestas HTTP simuladas y no conectan con Neon ni envían correos.
Comprueba también el login, menú móvil y formularios en el navegador antes de publicar cambios visuales.

# Gestión institucional y campana

La sección **Gestión institucional** ofrece una lista común y un formulario con un desplegable de tipos. Dirección administra los registros; las demás cuentas operativas consultan los registros asignados. La campana muestra avisos internos persistentes y permite abrir el registro y marcarlo leído. Se actualiza cada 60 segundos en pestañas visibles, al recuperar el foco y al abrirla. No envía correo.

Antes de probar, aplica la migración `0008` del backend y vuelve a ingresar para actualizar los permisos. Se conserva `VITE_API_URL=/api`. Los detalles y el procedimiento de Neon están en [la guía del backend](../backend/docs/institutional.md).
