import type { IconName } from '../../components/Icon';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import {
  canManagePractice,
  canReadOwnPractice,
  canReadSupervisedPractice,
} from '../practicum/practicum-access';

export type WorkspaceSection =
  | 'home'
  | 'accounts'
  | 'audit'
  | 'profile'
  | 'system'
  | 'practicum'
  | 'institutional'
  | 'agenda'
  | 'cases'
  | 'evaluations'
  | 'reports'
  | 'supervisions'
  | 'tasks'
  | 'hours'
  | 'my-practice'
  | 'project'
  | 'documents';
export type NavigationItem = Readonly<{
  id: WorkspaceSection;
  label: string;
  description: string;
  icon: IconName;
  available: boolean;
}>;
type WorkspaceIdentity = AuthenticatedIdentity['identity'];

const upcomingItems: Readonly<
  Partial<Record<WorkspaceSection, Omit<NavigationItem, 'id' | 'available'>>>
> = {
  practicum: {
    label: 'Practicantes',
    description:
      'Organiza las prácticas y acompaña el trabajo de los estudiantes.',
    icon: 'users',
  },
  institutional: {
    label: 'Actividades institucionales',
    description:
      'Proyectos, convenios y actividades que vinculan al Gabinete con su comunidad.',
    icon: 'book',
  },
  agenda: {
    label: 'Mi agenda',
    description: 'Un espacio para organizar horarios, ambientes y encuentros.',
    icon: 'calendar',
  },
  cases: {
    label: 'Casos asignados',
    description: 'Consulta y seguimiento de los casos vinculados a tu trabajo.',
    icon: 'folder',
  },
  evaluations: {
    label: 'Evaluaciones',
    description: 'Organización de evaluaciones, instrumentos e informes.',
    icon: 'clipboard',
  },
  reports: {
    label: 'Reportes',
    description: 'Información para acompañar las decisiones del Gabinete.',
    icon: 'chart',
  },
  supervisions: {
    label: 'Supervisiones',
    description: 'Acompañamiento y seguimiento de las prácticas estudiantiles.',
    icon: 'users',
  },
  tasks: {
    label: 'Mis tareas',
    description:
      'Organiza el trabajo de tu práctica y las tareas que te asignen.',
    icon: 'clipboard',
  },
  hours: {
    label: 'Mis actividades y horas',
    description:
      'Crea actividades, retoma tareas y consulta tu tiempo de práctica.',
    icon: 'clock',
  },
  'my-practice': {
    label: 'Mi práctica',
    description: 'Tu período de práctica, participación y supervisión.',
    icon: 'book',
  },
  project: {
    label: 'Mi proyecto',
    description: 'Un espacio para acompañar tu trabajo de titulación.',
    icon: 'book',
  },
  documents: {
    label: 'Mis documentos',
    description: 'Organiza la documentación vinculada a tu trabajo.',
    icon: 'folder',
  },
};
const sectionsByRole: Readonly<Record<string, readonly WorkspaceSection[]>> = {
  director: [
    'practicum',
    'institutional',
    'agenda',
    'cases',
    'evaluations',
    'reports',
  ],
  psychologist: ['agenda', 'cases', 'evaluations', 'practicum', 'supervisions'],
  assistant: ['hours', 'my-practice', 'cases'],
  degree_student: ['project', 'hours', 'my-practice', 'documents'],
};
export function getNavigation(
  identity: WorkspaceIdentity,
): readonly NavigationItem[] {
  const items: NavigationItem[] = [
    {
      id: 'home',
      label: 'Inicio',
      description: 'Tu espacio de trabajo en el Gabinete.',
      icon: 'home',
      available: true,
    },
  ];
  if (identity.permissions.includes('accounts.read'))
    items.push({
      id: 'accounts',
      label: identity.roles.includes('administrator')
        ? 'Dirección del Gabinete'
        : 'Usuarios',
      description:
        'Administra las cuentas y los accesos dentro de tu ámbito autorizado.',
      icon: 'users',
      available: true,
    });
  const sections = new Set(
    identity.roles.flatMap((role) => sectionsByRole[role] ?? []),
  );
  for (const id of sections) {
    const item = upcomingItems[id];
    if (item) {
      const available =
        id === 'practicum'
          ? canManagePractice(identity) || canReadSupervisedPractice(identity)
          : ['tasks', 'hours', 'my-practice'].includes(id) &&
            canReadOwnPractice(identity);
      const label =
        id === 'practicum' && !identity.roles.includes('director')
          ? 'Prácticas supervisadas'
          : item.label;
      items.push({ ...item, label, id, available });
    }
  }
  if (identity.permissions.includes('audit.read_identity'))
    items.push({
      id: 'audit',
      label: 'Auditoría de accesos',
      description: 'Consulta la trazabilidad de las operaciones sobre cuentas.',
      icon: 'shield',
      available: true,
    });
  if (identity.roles.includes('administrator'))
    items.push({
      id: 'system',
      label: 'Estado del servicio',
      description: 'Comprueba la disponibilidad del servicio.',
      icon: 'chart',
      available: true,
    });
  items.push({
    id: 'profile',
    label: 'Mi cuenta',
    description: 'Tu información de contacto, contraseña y sesiones.',
    icon: 'person',
    available: true,
  });
  return items;
}
