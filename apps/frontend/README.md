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
- `src/features/workspace`: estructura autenticada, navegación por perfil y composición de pantallas.
- `src/lib`: cliente HTTP y funciones de presentación en español.
- `src/styles`: colores, tipografía, componentes y adaptación a pantallas pequeñas.

Esta organización corresponde a la presentación del sistema cliente-servidor con backend monolítico modular por dominio y capas, comunicado mediante REST/HTTPS. Los componentes reutilizan los contratos y clientes API actuales; las reglas de negocio y la autorización se mantienen en el backend.

## Perfiles y alcance visual

| Perfil existente | Vista preparada |
| --- | --- |
| Administrador | Dirección del Gabinete, auditoría autorizada y estado del servicio |
| Director | Usuarios autorizados, practicantes, actividades institucionales, agenda, casos, evaluaciones y reportes |
| Psicólogo | Agenda, casos, evaluaciones y supervisiones |
| Auxiliar / pasante | Tareas, horas, práctica y casos asignados |
| Tesista | Proyecto, tareas y documentos |

Los menús de cuentas y auditoría requieren los permisos recibidos de la API. Una cuenta con varios perfiles combina sus menús sin duplicarlos. Ocultar controles en el frontend no sustituye la autorización del backend.

Pasante es una denominación de práctica dentro del perfil auxiliar existente; este rediseño no agrega un sexto rol de seguridad.

Usuarios, invitaciones, activación, mi cuenta y auditoría utilizan sus operaciones actuales. Prácticas, actividades institucionales y los demás módulos futuros muestran **Próximamente**, sin simular guardados ni cargar datos de negocio.

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
