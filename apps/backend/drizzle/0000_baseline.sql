-- SISTEMA WEB DEL GABINETE DE SERVICIOS PSICOLÓGICOS UCB
-- PostgreSQL 15+ | Propuesta revisada v3.0 | 2026-11-23
-- Diseñado para NestJS + Drizzle ORM + PostgreSQL (Neon) + objetos privados (S3/R2).
-- SOLO PARA BASE NUEVA Y VACIA. Este archivo completo NO es una migración sobre v1/v2.
-- Las reglas clínicas y estados finales deben validarse con el BPMN TO-BE y la UCB.
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS iam;
CREATE SCHEMA IF NOT EXISTS care;
CREATE SCHEMA IF NOT EXISTS agenda;
CREATE SCHEMA IF NOT EXISTS evaluation;
CREATE SCHEMA IF NOT EXISTS practicum;
CREATE SCHEMA IF NOT EXISTS projects;
CREATE SCHEMA IF NOT EXISTS quality;
CREATE SCHEMA IF NOT EXISTS archive;
CREATE SCHEMA IF NOT EXISTS reporting;
CREATE SCHEMA IF NOT EXISTS audit;

-- 1. Identidades de personas y procedencia institucional
CREATE TABLE core.institution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(200) NOT NULL,
  kind varchar(24) NOT NULL CHECK (kind IN ('university','ucb_unit','company','school','ngo','public','other')),
  parent_institution_id uuid REFERENCES core.institution(id) ON DELETE RESTRICT,
  external_code varchar(60),
  contact_email varchar(254),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT institution_not_self CHECK (parent_institution_id IS NULL OR id <> parent_institution_id)
);
CREATE UNIQUE INDEX institution_external_code_uq ON core.institution (external_code) WHERE external_code IS NOT NULL;
CREATE INDEX institution_parent_idx ON core.institution(parent_institution_id);

CREATE TABLE core.academic_program (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES core.institution(id) ON DELETE RESTRICT,
  name varchar(150) NOT NULL,
  code varchar(40),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id,name),
  UNIQUE (id,institution_id) -- permite validar la afiliación con FK compuesta
);

CREATE TABLE core.person (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  given_names varchar(160) NOT NULL,
  family_names varchar(160) NOT NULL,
  birth_date date, -- opcional: puede no conocerse durante la primera derivación
  sex_recorded varchar(30), -- dato declarado/autorizado; no inferir ni inventar para estadística
  identity_doc_type varchar(30),
  identity_doc_number varchar(60),
  contact_email varchar(254),
  contact_phone varchar(50),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT doc_number_requires_type CHECK (identity_doc_number IS NULL OR identity_doc_type IS NOT NULL),
  CONSTRAINT person_birth_date_not_future CHECK(birth_date IS NULL OR birth_date <= CURRENT_DATE),
  -- Catálogo preliminar; validar significado/terminología con el Gabinete.
  CONSTRAINT person_sex_catalog CHECK(sex_recorded IS NULL OR sex_recorded IN
      ('female','male','intersex','other','not_disclosed'))
);
CREATE UNIQUE INDEX person_identity_document_uq ON core.person(identity_doc_type,identity_doc_number)
  WHERE identity_doc_number IS NOT NULL;
CREATE INDEX person_name_idx ON core.person(family_names,given_names);

-- Contactos de emergencia: información altamente sensible, opcional y con acceso restringido.
-- Un contacto NO equivale a consentimiento genérico ni habilita llamadas automáticas.
CREATE TABLE core.emergency_contact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES core.person(id) ON DELETE RESTRICT,
  contact_name varchar(200) NOT NULL,
  relationship varchar(80),
  contact_phone varchar(50) NOT NULL,
  contact_email varchar(254),
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  contact_authorized boolean NOT NULL DEFAULT false,
  authorization_recorded_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_name_nonempty CHECK(length(trim(contact_name))>0),
  CONSTRAINT contact_phone_nonempty CHECK(length(trim(contact_phone))>0),
  CONSTRAINT contact_authorization_consistent CHECK(NOT contact_authorized OR authorization_recorded_at IS NOT NULL)
);
CREATE INDEX emergency_contact_person_idx ON core.emergency_contact(person_id);
CREATE UNIQUE INDEX emergency_one_active_primary_uq ON core.emergency_contact(person_id)
  WHERE is_primary AND is_active;

CREATE TABLE core.person_affiliation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES core.person(id) ON DELETE RESTRICT,
  institution_id uuid REFERENCES core.institution(id) ON DELETE RESTRICT,
  academic_program_id uuid REFERENCES core.academic_program(id) ON DELETE RESTRICT,
  affiliation_kind varchar(35) NOT NULL CHECK (affiliation_kind IN
    ('student','teacher','staff','alumni','older_adult','external','intern','other')),
  student_semester smallint CHECK (student_semester BETWEEN 1 AND 20),
  started_on date,
  ended_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_on IS NULL OR started_on IS NULL OR ended_on >= started_on),
  CHECK (academic_program_id IS NULL OR institution_id IS NOT NULL),
  CONSTRAINT affiliation_program_same_institution FOREIGN KEY (academic_program_id,institution_id)
    REFERENCES core.academic_program(id,institution_id) ON DELETE RESTRICT
);
CREATE INDEX affiliation_person_idx ON core.person_affiliation(person_id);
CREATE INDEX affiliation_program_idx ON core.person_affiliation(academic_program_id);

-- 2. Cuentas y RBAC. Una persona atendida NO necesita una cuenta de inicio de sesión.
CREATE TABLE iam.account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL UNIQUE REFERENCES core.person(id) ON DELETE RESTRICT,
  email varchar(254) NOT NULL,
  username varchar(80), -- alternativo al correo institucional; opcional
  auth_method varchar(25) NOT NULL DEFAULT 'local'
    CHECK(auth_method IN ('local','institutional_sso')),
  external_subject varchar(255), -- identificador SSO, cuando aplique
  password_hash text, -- Argon2id u otro hash aprobado; NUNCA texto claro
  account_status varchar(20) NOT NULL DEFAULT 'invited'
    CHECK (account_status IN ('invited','active','disabled')),
  last_login_at timestamptz,
  mfa_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_username_nonempty CHECK(username IS NULL OR length(trim(username))>=3),
  CONSTRAINT active_local_account_needs_password CHECK(
     account_status <> 'active' OR auth_method <> 'local' OR
     (password_hash IS NOT NULL AND length(password_hash)>0)
  ),
  CONSTRAINT active_sso_account_needs_subject CHECK(
     account_status <> 'active' OR auth_method <> 'institutional_sso' OR
     (external_subject IS NOT NULL AND length(trim(external_subject))>0)
  ),
  CONSTRAINT local_account_no_external_subject CHECK(auth_method <> 'local' OR external_subject IS NULL)
);
CREATE UNIQUE INDEX account_email_normalized_uq ON iam.account(lower(email));
CREATE UNIQUE INDEX account_username_normalized_uq ON iam.account(lower(username)) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX account_sso_subject_uq ON iam.account(external_subject)
  WHERE auth_method='institutional_sso' AND external_subject IS NOT NULL;

CREATE TABLE iam.role (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(60) NOT NULL UNIQUE,
  label varchar(100) NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE iam.permission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(100) NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE iam.role_permission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES iam.role(id) ON DELETE RESTRICT,
  permission_id uuid NOT NULL REFERENCES iam.permission(id) ON DELETE RESTRICT,
  UNIQUE(role_id,permission_id)
);
CREATE TABLE iam.account_role (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  role_id uuid NOT NULL REFERENCES iam.role(id) ON DELETE RESTRICT,
  granted_by_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);
CREATE UNIQUE INDEX active_account_role_uq ON iam.account_role(account_id,role_id)
  WHERE revoked_at IS NULL;
CREATE INDEX account_role_account_idx ON iam.account_role(account_id);

-- 3. Atención, derivaciones, casos y máquina de estados del workflow
CREATE TABLE care.service_type (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(45) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE care.consultation_reason (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(50) NOT NULL UNIQUE,
  name varchar(140) NOT NULL,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE care.intake_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES core.person(id) ON DELETE RESTRICT,
  originating_institution_id uuid REFERENCES core.institution(id) ON DELETE RESTRICT,
  received_at timestamptz NOT NULL DEFAULT now(),
  source_channel varchar(30) NOT NULL CHECK (source_channel IN
    ('institutional_email','online_form','qr_form','in_person','phone','other')),
  external_reference varchar(120),
  reason_id uuid REFERENCES care.consultation_reason(id) ON DELETE RESTRICT,
  request_summary text,
  age_at_intake_reported smallint CHECK(age_at_intake_reported BETWEEN 0 AND 120),
  -- Dato declarado si la fecha de nacimiento no está disponible; NO es la edad calculada.
  reported_urgency varchar(30), -- declarado/registrado por humano; NO clasificación automática
  urgency_recorded_by_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  request_status varchar(20) NOT NULL DEFAULT 'received'
    CHECK (request_status IN ('received','under_review','accepted','rejected','cancelled')),
  received_by_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intake_status_received_idx ON care.intake_request(request_status,received_at DESC);
CREATE INDEX intake_person_idx ON care.intake_request(person_id);

CREATE TABLE care.case_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(50) NOT NULL UNIQUE,
  label varchar(120) NOT NULL,
  is_terminal boolean NOT NULL DEFAULT false,
  sort_order smallint NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE care.allowed_state_transition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_state_id uuid NOT NULL REFERENCES care.case_state(id) ON DELETE RESTRICT,
  to_state_id uuid NOT NULL REFERENCES care.case_state(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  description varchar(250),
  UNIQUE(from_state_id,to_state_id),
  CHECK(from_state_id <> to_state_id)
);

CREATE TABLE care.case_file (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number varchar(45) NOT NULL UNIQUE,
  person_id uuid NOT NULL REFERENCES core.person(id) ON DELETE RESTRICT,
  intake_request_id uuid UNIQUE REFERENCES care.intake_request(id) ON DELETE RESTRICT,
  service_type_id uuid NOT NULL REFERENCES care.service_type(id) ON DELETE RESTRICT,
  primary_reason_id uuid REFERENCES care.consultation_reason(id) ON DELETE RESTRICT,
  current_state_id uuid NOT NULL REFERENCES care.case_state(id) ON DELETE RESTRICT,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  operational_summary text, -- no almacenar aquí notas psicoterapéuticas fuera del alcance autorizado
  created_by_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  updated_by_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  state_changed_by_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  state_change_reason text,
  version_no integer NOT NULL DEFAULT 1 CHECK(version_no > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(closed_at IS NULL OR closed_at >= opened_at)
);
CREATE INDEX case_person_opened_idx ON care.case_file(person_id,opened_at DESC);
CREATE INDEX case_state_idx ON care.case_file(current_state_id);
CREATE INDEX case_service_idx ON care.case_file(service_type_id);

-- Para casos que el Gabinete autorice como familiares o de pareja.
-- core.person y care.case_file conservan el consultante titular;
-- estos vínculos opcionales no redefinen el responsable de acceso al caso.
CREATE TABLE care.case_participant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES care.case_file(id) ON DELETE RESTRICT,
  person_id uuid NOT NULL REFERENCES core.person(id) ON DELETE RESTRICT,
  participation_role varchar(30) NOT NULL CHECK(participation_role IN
     ('partner','family_member','guardian','other')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  registered_by_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  CHECK(left_at IS NULL OR left_at >= joined_at)
);
CREATE UNIQUE INDEX active_case_participant_uq ON care.case_participant(case_id,person_id)
  WHERE left_at IS NULL;
CREATE INDEX case_participant_person_idx ON care.case_participant(person_id);

CREATE TABLE care.case_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES care.case_file(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  assignment_kind varchar(22) NOT NULL CHECK (assignment_kind IN ('responsible','support','supervisor')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  assigned_by_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  CHECK(released_at IS NULL OR released_at >= assigned_at)
);
CREATE UNIQUE INDEX one_active_responsible_per_case ON care.case_assignment(case_id)
  WHERE assignment_kind='responsible' AND released_at IS NULL;
CREATE INDEX active_case_assignment_idx ON care.case_assignment(account_id,case_id)
  WHERE released_at IS NULL;

CREATE TABLE care.case_state_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES care.case_file(id) ON DELETE RESTRICT,
  from_state_id uuid REFERENCES care.case_state(id) ON DELETE RESTRICT,
  to_state_id uuid NOT NULL REFERENCES care.case_state(id) ON DELETE RESTRICT,
  changed_by_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  reason text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX case_state_history_idx ON care.case_state_history(case_id,changed_at DESC);

CREATE TABLE care.case_referral (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES care.case_file(id) ON DELETE RESTRICT,
  kind varchar(15) NOT NULL CHECK(kind IN ('internal','external')),
  destination_institution_id uuid REFERENCES core.institution(id) ON DELETE RESTRICT,
  referred_to_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  description text,
  referral_status varchar(20) NOT NULL DEFAULT 'sent'
    CHECK(referral_status IN ('draft','sent','accepted','declined','completed','cancelled')),
  referred_at timestamptz NOT NULL DEFAULT now(),
  referred_by_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (destination_institution_id IS NOT NULL OR referred_to_account_id IS NOT NULL)
);
CREATE INDEX referral_case_idx ON care.case_referral(case_id,referred_at DESC);

CREATE TABLE care.consent_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES core.person(id) ON DELETE RESTRICT,
  case_id uuid REFERENCES care.case_file(id) ON DELETE RESTRICT,
  consent_kind varchar(60) NOT NULL,
  consent_status varchar(15) NOT NULL CHECK(consent_status IN ('granted','revoked','declined')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  effective_at timestamptz,
  recorded_by_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Agenda: impedir choques de sala y de profesional para citas activas.
CREATE TABLE agenda.room (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL UNIQUE,
  kind varchar(30) NOT NULL DEFAULT 'consultation'
    CHECK(kind IN ('consultation','evaluation','gesell','laboratory','meeting','other')),
  capacity smallint CHECK(capacity IS NULL OR capacity > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE agenda.appointment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES care.case_file(id) ON DELETE RESTRICT,
  room_id uuid REFERENCES agenda.room(id) ON DELETE RESTRICT,
  professional_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  booked_by_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  appointment_kind varchar(25) NOT NULL CHECK (appointment_kind IN
    ('session','evaluation','interview','practice','workshop','institutional','other')),
  title varchar(200),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  appointment_status varchar(20) NOT NULL DEFAULT 'scheduled'
    CHECK (appointment_status IN ('scheduled','confirmed','completed','cancelled','no_show')),
  cancellation_reason text,
  updated_by_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  change_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,case_id),
  CHECK(ends_at > starts_at)
);
ALTER TABLE agenda.appointment ADD CONSTRAINT room_no_overlap EXCLUDE USING gist
 (room_id WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&)
 WHERE (room_id IS NOT NULL AND appointment_status IN ('scheduled','confirmed'));
ALTER TABLE agenda.appointment ADD CONSTRAINT professional_no_overlap EXCLUDE USING gist
 (professional_account_id WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&)
 WHERE (professional_account_id IS NOT NULL AND appointment_status IN ('scheduled','confirmed'));
CREATE INDEX appointment_case_idx ON agenda.appointment(case_id,starts_at DESC);
CREATE INDEX appointment_calendar_idx ON agenda.appointment(starts_at,appointment_status);

CREATE TABLE agenda.appointment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES agenda.appointment(id) ON DELETE RESTRICT,
  previous_starts_at timestamptz NOT NULL,
  previous_ends_at timestamptz NOT NULL,
  new_starts_at timestamptz NOT NULL,
  new_ends_at timestamptz NOT NULL,
  previous_room_id uuid REFERENCES agenda.room(id) ON DELETE RESTRICT,
  new_room_id uuid REFERENCES agenda.room(id) ON DELETE RESTRICT,
  previous_professional_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  new_professional_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  previous_status varchar(20) NOT NULL,
  new_status varchar(20) NOT NULL,
  reason text,
  changed_by_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX appointment_history_idx ON agenda.appointment_history(appointment_id,changed_at DESC);

CREATE TABLE care.session_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES care.case_file(id) ON DELETE RESTRICT,
  appointment_id uuid UNIQUE,
  professional_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  session_status varchar(18) NOT NULL DEFAULT 'completed'
    CHECK (session_status IN ('completed','voided','incomplete')),
  operational_observation text,
  recorded_by_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  updated_by_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  change_reason text,
  verified_by_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,case_id),
  FOREIGN KEY (appointment_id,case_id) REFERENCES agenda.appointment(id,case_id) ON DELETE RESTRICT,
  CHECK(ended_at IS NULL OR ended_at > started_at),
  CHECK(verified_at IS NULL OR verified_by_account_id IS NOT NULL)
);
CREATE INDEX session_case_time_idx ON care.session_record(case_id,started_at DESC);
CREATE INDEX session_prof_time_idx ON care.session_record(professional_account_id,started_at DESC);

CREATE UNIQUE INDEX session_deduplicate_active_idx ON care.session_record(case_id,professional_account_id,started_at)
  WHERE session_status <> 'voided';
CREATE TABLE care.session_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES care.session_record(id) ON DELETE RESTRICT,
  previous_status varchar(18) NOT NULL,
  new_status varchar(18) NOT NULL,
  changed_by_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  reason text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CHECK(previous_status <> new_status)
);
CREATE INDEX session_status_history_idx ON care.session_status_history(session_id,changed_at DESC);

-- 5. Evaluaciones: registro de instrumentos y resultados autorizados, SIN puntuación automática.
CREATE TABLE evaluation.instrument (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(60) NOT NULL UNIQUE,
  name varchar(180) NOT NULL,
  modality varchar(20) NOT NULL DEFAULT 'manual'
    CHECK(modality IN ('manual','digital','mixed')),
  requires_license boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Préstamos de material físico de pruebas: respaldo documental existente.
-- Registro operativo; no interpreta resultados ni administra puntuaciones automáticas.
CREATE TABLE evaluation.instrument_loan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id uuid NOT NULL REFERENCES evaluation.instrument(id) ON DELETE RESTRICT,
  borrower_person_id uuid NOT NULL REFERENCES core.person(id) ON DELETE RESTRICT,
  components_description text NOT NULL,
  condition_at_checkout text,
  checked_out_at timestamptz,
  due_at timestamptz,
  returned_at timestamptz,
  condition_at_return text,
  loan_status varchar(18) NOT NULL DEFAULT 'requested'
     CHECK(loan_status IN ('requested','approved','checked_out','returned','cancelled')),
  checked_out_by_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  received_by_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  created_by_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (due_at IS NULL OR checked_out_at IS NULL OR due_at >= checked_out_at),
  CHECK (returned_at IS NULL OR checked_out_at IS NULL OR returned_at >= checked_out_at),
  CHECK (loan_status <> 'returned' OR (returned_at IS NOT NULL AND checked_out_at IS NOT NULL)),
  CHECK (returned_at IS NULL OR loan_status='returned'),
  CHECK (loan_status <> 'checked_out' OR (checked_out_at IS NOT NULL AND checked_out_by_account_id IS NOT NULL)),
  CHECK (loan_status <> 'returned' OR received_by_account_id IS NOT NULL),
  CHECK (length(trim(components_description))>0)
);
CREATE INDEX loan_borrower_time_idx ON evaluation.instrument_loan(borrower_person_id,created_at DESC);
CREATE INDEX loan_instrument_status_idx ON evaluation.instrument_loan(instrument_id,loan_status);

CREATE TABLE evaluation.evaluation_process (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES care.case_file(id) ON DELETE RESTRICT,
  responsible_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  evaluation_kind varchar(60) NOT NULL,
  process_status varchar(24) NOT NULL DEFAULT 'pending'
    CHECK(process_status IN ('pending','in_progress','report_prepared','follow_up','closed','cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  operational_findings text, -- condicionado a autorización institucional; no notas clínicas completas
  created_by_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (completed_at IS NULL OR completed_at >= requested_at)
);
CREATE INDEX evaluation_case_idx ON evaluation.evaluation_process(case_id,requested_at DESC);

CREATE TABLE evaluation.instrument_application (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES evaluation.evaluation_process(id) ON DELETE RESTRICT,
  instrument_id uuid NOT NULL REFERENCES evaluation.instrument(id) ON DELETE RESTRICT,
  applied_by_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  applied_at timestamptz,
  result_summary text,
  structured_result jsonb, -- solo información de resultados aprobada; no motor de puntuación
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(structured_result IS NULL OR jsonb_typeof(structured_result)='object')
);
CREATE INDEX instrument_application_evaluation_idx ON evaluation.instrument_application(evaluation_id);

-- 6. Prácticas académicas
CREATE TABLE practicum.academic_term (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(30) NOT NULL UNIQUE,
  label varchar(90) NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  CHECK(ends_on >= starts_on)
);
CREATE TABLE practicum.placement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_person_id uuid NOT NULL REFERENCES core.person(id) ON DELETE RESTRICT,
  term_id uuid NOT NULL REFERENCES practicum.academic_term(id) ON DELETE RESTRICT,
  supervisor_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  placement_kind varchar(25) NOT NULL CHECK(placement_kind IN ('assistant','intern','course_practice','other')),
  started_on date,
  ended_on date,
  placement_status varchar(20) NOT NULL DEFAULT 'planned'
    CHECK(placement_status IN ('planned','active','completed','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ended_on IS NULL OR started_on IS NULL OR ended_on >= started_on)
);
CREATE INDEX placement_student_term_idx ON practicum.placement(student_person_id,term_id);
CREATE TABLE practicum.placement_case (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id uuid NOT NULL REFERENCES practicum.placement(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES care.case_file(id) ON DELETE RESTRICT,
  assigned_by_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  CHECK(released_at IS NULL OR released_at >= assigned_at)
);
CREATE UNIQUE INDEX active_placement_case_uq ON practicum.placement_case(placement_id,case_id) WHERE released_at IS NULL;

CREATE TABLE practicum.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id uuid NOT NULL REFERENCES practicum.placement(id) ON DELETE RESTRICT,
  case_id uuid REFERENCES care.case_file(id) ON DELETE RESTRICT,
  activity_kind varchar(70) NOT NULL,
  description text,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  approval_status varchar(18) NOT NULL DEFAULT 'pending'
    CHECK(approval_status IN ('pending','approved','rejected')),
  approved_by_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ended_at > started_at),
  CHECK(approved_at IS NULL OR approved_by_account_id IS NOT NULL)
);
CREATE INDEX activity_log_placement_idx ON practicum.activity_log(placement_id,started_at DESC);
CREATE TABLE practicum.supervision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id uuid NOT NULL REFERENCES practicum.placement(id) ON DELETE RESTRICT,
  supervisor_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  supervised_at timestamptz NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE practicum.performance_review (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id uuid NOT NULL REFERENCES practicum.placement(id) ON DELETE RESTRICT,
  reviewer_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  assessment_summary text,
  approved boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Proyectos, convenios, talleres, campañas e instituciones
CREATE TABLE projects.agreement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES core.institution(id) ON DELETE RESTRICT,
  agreement_code varchar(65),
  title varchar(230) NOT NULL,
  starts_on date,
  ends_on date,
  agreement_status varchar(18) NOT NULL DEFAULT 'draft'
    CHECK(agreement_status IN ('draft','active','expired','closed')),
  responsible_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);
CREATE UNIQUE INDEX agreement_code_uq ON projects.agreement(agreement_code) WHERE agreement_code IS NOT NULL;
CREATE TABLE projects.project (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_code varchar(60) UNIQUE,
  name varchar(200) NOT NULL,
  project_kind varchar(25) NOT NULL CHECK(project_kind IN
    ('campaign','research','workshop','program','outreach','other')),
  project_status varchar(20) NOT NULL DEFAULT 'planned'
    CHECK(project_status IN ('planned','active','completed','cancelled')),
  responsible_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  starts_on date,
  ends_on date,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);
CREATE TABLE projects.project_institution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects.project(id) ON DELETE RESTRICT,
  institution_id uuid NOT NULL REFERENCES core.institution(id) ON DELETE RESTRICT,
  involvement varchar(25) NOT NULL DEFAULT 'participant'
    CHECK(involvement IN ('organizer','partner','beneficiary','participant','other')),
  UNIQUE(project_id,institution_id,involvement)
);
CREATE TABLE projects.activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects.project(id) ON DELETE RESTRICT,
  agreement_id uuid REFERENCES projects.agreement(id) ON DELETE RESTRICT,
  institution_id uuid REFERENCES core.institution(id) ON DELETE RESTRICT,
  activity_kind varchar(35) NOT NULL CHECK(activity_kind IN
    ('workshop','campaign','research','meeting','training','other')),
  title varchar(220) NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  venue varchar(160),
  activity_status varchar(18) NOT NULL DEFAULT 'planned'
    CHECK(activity_status IN ('planned','completed','cancelled')),
  reported_participants integer CHECK(reported_participants IS NULL OR reported_participants >= 0),
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX project_activity_period_idx ON projects.activity(starts_at DESC,activity_kind);
CREATE TABLE projects.activity_participant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES projects.activity(id) ON DELETE RESTRICT,
  person_id uuid NOT NULL REFERENCES core.person(id) ON DELETE RESTRICT,
  attendance_status varchar(15) NOT NULL DEFAULT 'registered'
    CHECK(attendance_status IN ('registered','attended','absent')),
  participant_role varchar(30) NOT NULL DEFAULT 'attendee',
  UNIQUE(activity_id,person_id)
);

-- 8. Calidad del servicio e interrupciones declaradas por usuarios.
CREATE TABLE quality.service_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES care.case_file(id) ON DELETE RESTRICT,
  session_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  rating smallint CHECK(rating BETWEEN 1 AND 5),
  comments text,
  collection_method varchar(25) NOT NULL DEFAULT 'web'
    CHECK(collection_method IN ('web','in_person','external_form','other')),
  entered_by_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (session_id,case_id) REFERENCES care.session_record(id,case_id) ON DELETE RESTRICT,
  CHECK(rating IS NOT NULL OR comments IS NOT NULL)
);
CREATE INDEX feedback_case_idx ON quality.service_feedback(case_id,recorded_at DESC);
CREATE TABLE quality.case_interruption (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES care.case_file(id) ON DELETE RESTRICT,
  reason_category varchar(80),
  declared_reason text, -- lo declara la persona; nunca inferir causa clínica automáticamente
  declared_at timestamptz NOT NULL DEFAULT now(),
  recorded_by_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 9. Archivos: metadatos en BD; contenido en bucket PRIVADO. Versiones inmutables.
CREATE TABLE archive.document_type (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(50) NOT NULL UNIQUE,
  label varchar(120) NOT NULL,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE archive.document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type_id uuid NOT NULL REFERENCES archive.document_type(id) ON DELETE RESTRICT,
  title varchar(230) NOT NULL,
  confidentiality varchar(20) NOT NULL DEFAULT 'restricted'
    CHECK(confidentiality IN ('internal','restricted','highly_restricted')),
  original_source varchar(22) NOT NULL DEFAULT 'digital'
    CHECK(original_source IN ('digital','scanned','external')),
  created_by_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE archive.document_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES archive.document(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK(version_number > 0),
  provider varchar(30) NOT NULL DEFAULT 's3_compatible',
  bucket_name varchar(120) NOT NULL,
  object_key text NOT NULL, -- NO guardar URL pública ni URL prefirmada
  storage_version_id varchar(240),
  original_filename varchar(250) NOT NULL,
  content_type varchar(130) NOT NULL,
  content_length_bytes bigint NOT NULL CHECK(content_length_bytes >= 0),
  sha256_hex char(64) NOT NULL CHECK (sha256_hex ~ '^[0-9a-fA-F]{64}$'),
  uploaded_by_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id,version_number),
  UNIQUE(provider,bucket_name,object_key)
);
CREATE INDEX document_version_lookup_idx ON archive.document_version(document_id,version_number DESC);

-- FK real al recurso destino: evitar una relación polimórfica con IDs sin validar.
CREATE TABLE archive.document_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES archive.document(id) ON DELETE RESTRICT,
  case_id uuid REFERENCES care.case_file(id) ON DELETE RESTRICT,
  session_id uuid REFERENCES care.session_record(id) ON DELETE RESTRICT,
  evaluation_id uuid REFERENCES evaluation.evaluation_process(id) ON DELETE RESTRICT,
  placement_id uuid REFERENCES practicum.placement(id) ON DELETE RESTRICT,
  project_id uuid REFERENCES projects.project(id) ON DELETE RESTRICT,
  project_activity_id uuid REFERENCES projects.activity(id) ON DELETE RESTRICT,
  agreement_id uuid REFERENCES projects.agreement(id) ON DELETE RESTRICT,
  consent_id uuid REFERENCES care.consent_record(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  revoked_by_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  linked_by_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  linked_at timestamptz NOT NULL DEFAULT now(),
  CHECK(num_nonnulls(case_id,session_id,evaluation_id,placement_id,project_id,project_activity_id,agreement_id,consent_id)=1),
  CHECK(revoked_at IS NULL OR (revoked_by_account_id IS NOT NULL AND revoked_at >= linked_at))
);
CREATE INDEX document_link_case_idx ON archive.document_link(case_id) WHERE case_id IS NOT NULL;
CREATE INDEX document_link_session_idx ON archive.document_link(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX document_link_evaluation_idx ON archive.document_link(evaluation_id) WHERE evaluation_id IS NOT NULL;
CREATE INDEX document_link_placement_idx ON archive.document_link(placement_id) WHERE placement_id IS NOT NULL;
CREATE INDEX document_link_project_idx ON archive.document_link(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX document_link_activity_idx ON archive.document_link(project_activity_id) WHERE project_activity_id IS NOT NULL;
CREATE INDEX document_link_agreement_idx ON archive.document_link(agreement_id) WHERE agreement_id IS NOT NULL;
CREATE INDEX document_link_consent_idx ON archive.document_link(consent_id) WHERE consent_id IS NOT NULL;
CREATE UNIQUE INDEX document_link_case_uq ON archive.document_link(document_id,case_id) WHERE case_id IS NOT NULL AND revoked_at IS NULL;
CREATE UNIQUE INDEX document_link_session_uq ON archive.document_link(document_id,session_id) WHERE session_id IS NOT NULL AND revoked_at IS NULL;
CREATE UNIQUE INDEX document_link_evaluation_uq ON archive.document_link(document_id,evaluation_id) WHERE evaluation_id IS NOT NULL AND revoked_at IS NULL;

-- 10. Ejecuciones de reportes: conserva quién generó datos, no información clínica duplicada.
CREATE TABLE reporting.report_execution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_code varchar(90) NOT NULL,
  requested_by_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  report_format varchar(15) NOT NULL CHECK(report_format IN ('dashboard','pdf','xlsx','csv')),
  filters_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  outcome varchar(18) NOT NULL DEFAULT 'success' CHECK(outcome IN ('success','failure')),
  row_count integer CHECK(row_count IS NULL OR row_count >= 0),
  CHECK(jsonb_typeof(filters_json)='object')
);
CREATE INDEX report_execution_user_date_idx ON reporting.report_execution(requested_by_account_id,generated_at DESC);

-- 11. Auditoría. El registro NO replica PII ni valores clínicos: solo metadatos de cambios.
CREATE TABLE audit.change_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  schema_name text NOT NULL,
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  operation varchar(6) NOT NULL CHECK(operation IN ('INSERT','UPDATE','DELETE')),
  changed_column_names text[] NOT NULL DEFAULT ARRAY[]::text[],
  actor_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  db_login_name text NOT NULL,
  request_id text,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX audit_change_target_idx ON audit.change_event(schema_name,table_name,row_id,occurred_at DESC);
CREATE INDEX audit_change_actor_idx ON audit.change_event(actor_account_id,occurred_at DESC);

CREATE TABLE audit.access_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  action varchar(25) NOT NULL CHECK(action IN
    ('view_person','view_case','view_evaluation','download_document','upload_document','export_report','access_denied')),
  target_kind varchar(45) NOT NULL,
  target_id uuid,
  request_id text,
  purpose varchar(140),
  succeeded boolean NOT NULL DEFAULT true,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX access_actor_time_idx ON audit.access_event(actor_account_id,occurred_at DESC);
CREATE INDEX access_target_time_idx ON audit.access_event(target_kind,target_id,occurred_at DESC);

-- 12. Actualización automática de timestamps. No sobreescribir cambios desde el cliente.
CREATE OR REPLACE FUNCTION audit.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'core.institution','core.academic_program','core.person','core.emergency_contact','core.person_affiliation',
    'iam.account','care.intake_request','care.case_file','care.case_referral',
    'agenda.room','agenda.appointment','care.session_record',
    'evaluation.instrument','evaluation.instrument_loan','evaluation.evaluation_process','evaluation.instrument_application',
    'practicum.placement','practicum.activity_log','projects.agreement','projects.project',
    'projects.activity','archive.document'
  ] LOOP
    EXECUTE format('CREATE TRIGGER touch_timestamp BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION audit.touch_updated_at()',t);
  END LOOP;
END $$;

-- 13. Garantías de workflow implementadas en BD además de la lógica NestJS.
CREATE OR REPLACE FUNCTION care.validate_case_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.current_state_id IS DISTINCT FROM OLD.current_state_id THEN
    IF NEW.state_changed_by_account_id IS NULL THEN
      RAISE EXCEPTION 'El cambio de estado requiere responsable (state_changed_by_account_id)';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM care.allowed_state_transition tr
      WHERE tr.from_state_id=OLD.current_state_id AND tr.to_state_id=NEW.current_state_id AND tr.active
    ) THEN
      RAISE EXCEPTION 'Transición de workflow no autorizada';
    END IF;
    NEW.version_no := OLD.version_no + 1;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_transition BEFORE UPDATE OF current_state_id ON care.case_file
  FOR EACH ROW EXECUTE FUNCTION care.validate_case_transition();

CREATE OR REPLACE FUNCTION care.record_state_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO care.case_state_history(case_id,from_state_id,to_state_id,changed_by_account_id,reason)
    VALUES (NEW.id,NULL,NEW.current_state_id,NEW.created_by_account_id,'Apertura del caso');
  ELSIF NEW.current_state_id IS DISTINCT FROM OLD.current_state_id THEN
    INSERT INTO care.case_state_history(case_id,from_state_id,to_state_id,changed_by_account_id,reason)
    VALUES (NEW.id,OLD.current_state_id,NEW.current_state_id,NEW.state_changed_by_account_id,NEW.state_change_reason);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER record_initial_state AFTER INSERT ON care.case_file
  FOR EACH ROW EXECUTE FUNCTION care.record_state_history();
CREATE TRIGGER record_state_transition AFTER UPDATE OF current_state_id ON care.case_file
  FOR EACH ROW EXECUTE FUNCTION care.record_state_history();

-- 14. Agenda: conservar historial de cambios importantes.
CREATE OR REPLACE FUNCTION agenda.record_appointment_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(OLD.starts_at,OLD.ends_at,OLD.room_id,OLD.professional_account_id,OLD.appointment_status) IS DISTINCT FROM
     ROW(NEW.starts_at,NEW.ends_at,NEW.room_id,NEW.professional_account_id,NEW.appointment_status) THEN
    IF NEW.updated_by_account_id IS NULL THEN
      RAISE EXCEPTION 'La modificación de agenda requiere updated_by_account_id';
    END IF;
    INSERT INTO agenda.appointment_history(
      appointment_id,previous_starts_at,previous_ends_at,new_starts_at,new_ends_at,
      previous_room_id,new_room_id,previous_professional_account_id,new_professional_account_id,
      previous_status,new_status,reason,changed_by_account_id)
    VALUES (NEW.id,OLD.starts_at,OLD.ends_at,NEW.starts_at,NEW.ends_at,
      OLD.room_id,NEW.room_id,OLD.professional_account_id,NEW.professional_account_id,
      OLD.appointment_status,NEW.appointment_status,NEW.change_reason,NEW.updated_by_account_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER record_agenda_change AFTER UPDATE ON agenda.appointment
  FOR EACH ROW EXECUTE FUNCTION agenda.record_appointment_change();

-- 15. Bloqueo lógico de eliminación para registros cuyo histórico debe permanecer.
CREATE OR REPLACE FUNCTION audit.prevent_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Registro histórico protegido: %.% (%). Use estado/versión en lugar de eliminar o alterar', TG_TABLE_SCHEMA,TG_TABLE_NAME,TG_OP;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'care.case_state_history','care.session_status_history','agenda.appointment_history',
    'archive.document_version','audit.change_event','audit.access_event'
  ] LOOP
    EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation()',t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY[
    'care.case_file','care.session_record','archive.document','archive.document_link',
    'care.consent_record','evaluation.instrument_loan'
  ] LOOP
    EXECUTE format('CREATE TRIGGER prevent_hard_delete BEFORE DELETE ON %s FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation()',t);
  END LOOP;
END $$;

-- 16. Auditoría automática de INSERT / UPDATE / DELETE (sin copiar valores privados).
-- NestJS: dentro de CADA transacción SET LOCAL app.actor_id = '<account uuid>' y
-- SET LOCAL app.request_id = '<request id>'. Lecturas/descargas se auditan en app.
CREATE OR REPLACE FUNCTION audit.record_row_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_obj jsonb := '{}'::jsonb; new_obj jsonb := '{}'::jsonb;
        key_name text; changed_names text[] := ARRAY[]::text[];
        target_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_obj := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN new_obj := to_jsonb(NEW); END IF;
  FOR key_name IN SELECT jsonb_object_keys(old_obj || new_obj) LOOP
    IF (old_obj -> key_name) IS DISTINCT FROM (new_obj -> key_name) THEN
      changed_names := array_append(changed_names,key_name);
    END IF;
  END LOOP;
  target_id := COALESCE(NULLIF(new_obj->>'id',''),NULLIF(old_obj->>'id',''))::uuid;
  INSERT INTO audit.change_event(schema_name,table_name,row_id,operation,changed_column_names,
    actor_account_id,db_login_name,request_id)
  VALUES (TG_TABLE_SCHEMA,TG_TABLE_NAME,target_id,TG_OP,changed_names,
    NULLIF(current_setting('app.actor_id',true),'')::uuid,session_user,
    NULLIF(current_setting('app.request_id',true),''));
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'core.institution','core.academic_program','core.person','core.emergency_contact','core.person_affiliation',
    'iam.account','iam.role','iam.permission','iam.role_permission','iam.account_role',
    'care.service_type','care.consultation_reason','care.intake_request',
    'care.case_state','care.allowed_state_transition','care.case_file','care.case_participant',
    'care.case_assignment','care.case_state_history','care.case_referral','care.consent_record',
    'agenda.room','agenda.appointment','agenda.appointment_history','care.session_record','care.session_status_history',
    'evaluation.instrument','evaluation.instrument_loan','evaluation.evaluation_process','evaluation.instrument_application',
    'practicum.academic_term','practicum.placement','practicum.placement_case',
    'practicum.activity_log','practicum.supervision','practicum.performance_review',
    'projects.agreement','projects.project','projects.project_institution',
    'projects.activity','projects.activity_participant',
    'quality.service_feedback','quality.case_interruption',
    'archive.document_type','archive.document','archive.document_version','archive.document_link',
    'reporting.report_execution'
  ] LOOP
    EXECUTE format('CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION audit.record_row_change()',t);
  END LOOP;
END $$;

-- 17. Vistas para estadísticas: evitar columnas cacheadas de conteos y horas.
CREATE VIEW reporting.v_case_session_totals AS
SELECT c.id AS case_id,c.case_number,c.person_id,
       count(s.id) FILTER (WHERE s.session_status='completed')::bigint AS completed_sessions,
       max(s.started_at) FILTER (WHERE s.session_status='completed') AS last_completed_session_at
FROM care.case_file c LEFT JOIN care.session_record s ON s.case_id=c.id
GROUP BY c.id,c.case_number,c.person_id;

CREATE VIEW reporting.v_monthly_sessions AS
SELECT date_trunc('month',s.started_at AT TIME ZONE 'America/La_Paz')::date AS month_local,
       s.professional_account_id,c.service_type_id,
       count(*)::bigint AS completed_sessions
FROM care.session_record s JOIN care.case_file c ON c.id=s.case_id
WHERE s.session_status='completed'
GROUP BY 1,2,3;

CREATE VIEW reporting.v_practicum_approved_hours AS
SELECT p.id AS placement_id,p.student_person_id,
       COALESCE(sum(extract(epoch FROM (a.ended_at-a.started_at)) / 3600.0)
         FILTER(WHERE a.approval_status='approved'),0)::numeric(12,2) AS approved_hours
FROM practicum.placement p LEFT JOIN practicum.activity_log a ON a.placement_id=p.id
GROUP BY p.id,p.student_person_id;

-- SECURITY: estas vistas NO son endpoints públicos; NestJS aplica RBAC y filtros por caso.
-- Producción: usar credencial de BD con privilegios mínimos. Ni cliente React ni
-- cuentas de pacientes deben tener acceso directo a PostgreSQL/Storage.

-- 18. Anulación de sesiones con rastro propio y control de reasignaciones.
CREATE OR REPLACE FUNCTION care.validate_session_status_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.case_id IS DISTINCT FROM OLD.case_id THEN
    RAISE EXCEPTION 'No se puede transferir una sesión histórica entre casos';
  END IF;
  IF NEW.session_status IS DISTINCT FROM OLD.session_status AND NEW.updated_by_account_id IS NULL THEN
    RAISE EXCEPTION 'Un cambio de estado de sesión requiere responsable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_session_update BEFORE UPDATE ON care.session_record
  FOR EACH ROW EXECUTE FUNCTION care.validate_session_status_change();

CREATE OR REPLACE FUNCTION care.log_session_status_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.session_status IS DISTINCT FROM OLD.session_status THEN
    INSERT INTO care.session_status_history(session_id,previous_status,new_status,changed_by_account_id,reason)
    VALUES (NEW.id,OLD.session_status,NEW.session_status,NEW.updated_by_account_id,NEW.change_reason);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER log_session_status_change AFTER UPDATE OF session_status ON care.session_record
  FOR EACH ROW EXECUTE FUNCTION care.log_session_status_change();

CREATE OR REPLACE FUNCTION care.prevent_case_person_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.person_id IS DISTINCT FROM OLD.person_id THEN
    RAISE EXCEPTION 'No se puede reasignar un caso existente a otra persona';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_case_identity BEFORE UPDATE OF person_id ON care.case_file
  FOR EACH ROW EXECUTE FUNCTION care.prevent_case_person_change();

CREATE OR REPLACE FUNCTION evaluation.prevent_evaluation_case_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.case_id IS DISTINCT FROM OLD.case_id THEN
    RAISE EXCEPTION 'Una evaluación ya registrada no puede trasladarse a otro caso';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_evaluation_case BEFORE UPDATE OF case_id ON evaluation.evaluation_process
  FOR EACH ROW EXECUTE FUNCTION evaluation.prevent_evaluation_case_change();

CREATE OR REPLACE FUNCTION agenda.prevent_appointment_case_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.case_id IS DISTINCT FROM OLD.case_id THEN
    RAISE EXCEPTION 'La cita no puede reasignarse a un caso diferente';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_appointment_case BEFORE UPDATE OF case_id ON agenda.appointment
  FOR EACH ROW EXECUTE FUNCTION agenda.prevent_appointment_case_change();

CREATE OR REPLACE FUNCTION archive.protect_document_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'La revocación documental no se puede revertir';
  END IF;
  IF ROW(NEW.document_id,NEW.case_id,NEW.session_id,NEW.evaluation_id,NEW.placement_id,
        NEW.project_id,NEW.project_activity_id,NEW.agreement_id,NEW.consent_id)
    IS DISTINCT FROM ROW(OLD.document_id,OLD.case_id,OLD.session_id,OLD.evaluation_id,OLD.placement_id,
        OLD.project_id,OLD.project_activity_id,OLD.agreement_id,OLD.consent_id) THEN
    RAISE EXCEPTION 'No cambiar el destino de un documento histórico: revocar el vínculo y registrar otro';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_link_target BEFORE UPDATE ON archive.document_link
  FOR EACH ROW EXECUTE FUNCTION archive.protect_document_link();

-- 18a. Coherencia en el caso de varios participantes.
CREATE OR REPLACE FUNCTION care.validate_case_participant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM care.case_file c
             WHERE c.id=NEW.case_id AND c.person_id=NEW.person_id) THEN
    RAISE EXCEPTION 'El titular ya está asociado directamente al caso';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF ROW(OLD.case_id,OLD.person_id) IS DISTINCT FROM
       ROW(NEW.case_id,NEW.person_id) THEN
      RAISE EXCEPTION 'Para corregir un participante cerrar participación y registrar otro vínculo';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER case_participant_guard BEFORE INSERT OR UPDATE OF case_id,person_id
 ON care.case_participant FOR EACH ROW EXECUTE FUNCTION care.validate_case_participant();

-- 18. Coherencia entre entidades asociadas: no vincular un caso a una solicitud de otra persona.
CREATE OR REPLACE FUNCTION care.check_case_intake_person() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.intake_request_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM care.intake_request ir
      WHERE ir.id=NEW.intake_request_id AND ir.person_id=NEW.person_id) THEN
    RAISE EXCEPTION 'La solicitud de ingreso debe corresponder a la persona del caso';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER case_intake_person_guard BEFORE INSERT OR UPDATE OF person_id,intake_request_id
  ON care.case_file FOR EACH ROW EXECUTE FUNCTION care.check_case_intake_person();

CREATE OR REPLACE FUNCTION care.check_consent_case_person() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.case_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM care.case_file c WHERE c.id=NEW.case_id AND c.person_id=NEW.person_id) THEN
    RAISE EXCEPTION 'El consentimiento debe pertenecer a la persona del caso';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER consent_case_person_guard BEFORE INSERT OR UPDATE OF person_id,case_id
  ON care.consent_record FOR EACH ROW EXECUTE FUNCTION care.check_consent_case_person();

CREATE OR REPLACE FUNCTION core.check_program_institution() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.academic_program_id IS NOT NULL AND NEW.institution_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM core.academic_program ap
      WHERE ap.id=NEW.academic_program_id AND ap.institution_id=NEW.institution_id) THEN
    RAISE EXCEPTION 'La carrera debe pertenecer a la institución indicada';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER affiliation_program_guard BEFORE INSERT OR UPDATE OF academic_program_id,institution_id
  ON core.person_affiliation FOR EACH ROW EXECUTE FUNCTION core.check_program_institution();


-- 19. Auditoría v3: identidad humana, sesión de acceso y petición separadas.
-- auth_session.id es correlación interna, NO el secreto que viaja en la cookie.
CREATE TABLE iam.auth_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  token_hash bytea NOT NULL UNIQUE CHECK(octet_length(token_hash)=32),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revocation_reason varchar(100),
  client_ip inet,
  user_agent varchar(512),
  UNIQUE(id,account_id),
  CHECK(expires_at > created_at),
  CHECK(last_seen_at IS NULL OR last_seen_at >= created_at),
  CHECK(revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE INDEX auth_session_account_idx ON iam.auth_session(account_id,created_at DESC);
CREATE INDEX auth_session_live_idx ON iam.auth_session(account_id,expires_at) WHERE revoked_at IS NULL;

-- Autor directo donde lo solicita la interfaz. El histórico cubre todas las tablas auditadas.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['core.person','iam.account','iam.role','iam.permission'] LOOP
    EXECUTE format('ALTER TABLE %s ADD COLUMN created_by_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
       ADD COLUMN created_by_system varchar(100),
       ADD COLUMN updated_by_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
       ADD COLUMN updated_by_system varchar(100)',t);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT author_origin_required CHECK(num_nonnulls(created_by_account_id,created_by_system)=1)',t);
  END LOOP;
END $$;
ALTER TABLE core.person ADD CONSTRAINT person_names_nonempty CHECK(length(btrim(given_names))>0 AND length(btrim(family_names))>0);
ALTER TABLE iam.role ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE iam.permission ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), ADD COLUMN active boolean NOT NULL DEFAULT true;
CREATE TRIGGER touch_timestamp BEFORE UPDATE ON iam.role FOR EACH ROW EXECUTE FUNCTION audit.touch_updated_at();
CREATE TRIGGER touch_timestamp BEFORE UPDATE ON iam.permission FOR EACH ROW EXECUTE FUNCTION audit.touch_updated_at();

ALTER TABLE audit.change_event
  ADD COLUMN actor_kind varchar(10) NOT NULL CHECK(actor_kind IN ('human','system')),
  ADD COLUMN auth_session_id uuid,
  ADD COLUMN system_actor varchar(100),
  ALTER COLUMN request_id TYPE uuid USING request_id::uuid,
  ALTER COLUMN request_id SET NOT NULL,
  ADD CONSTRAINT change_actor_context CHECK(
    (actor_kind='human' AND actor_account_id IS NOT NULL AND auth_session_id IS NOT NULL AND system_actor IS NULL)
    OR (actor_kind='system' AND actor_account_id IS NULL AND auth_session_id IS NULL AND length(btrim(system_actor))>0 AND system_actor IS NOT NULL)),
  ADD CONSTRAINT change_session_owner FOREIGN KEY(auth_session_id,actor_account_id)
    REFERENCES iam.auth_session(id,account_id) ON DELETE RESTRICT;
CREATE INDEX audit_change_session_idx ON audit.change_event(auth_session_id,occurred_at DESC) WHERE auth_session_id IS NOT NULL;
CREATE INDEX audit_change_request_idx ON audit.change_event(request_id);

ALTER TABLE audit.access_event
  ADD COLUMN auth_session_id uuid NOT NULL,
  ALTER COLUMN request_id TYPE uuid USING request_id::uuid,
  ALTER COLUMN request_id SET NOT NULL,
  ADD CONSTRAINT access_session_owner FOREIGN KEY(auth_session_id,actor_account_id)
    REFERENCES iam.auth_session(id,account_id) ON DELETE RESTRICT;
CREATE INDEX audit_access_request_idx ON audit.access_event(request_id);
CREATE INDEX audit_access_session_idx ON audit.access_event(auth_session_id,occurred_at DESC);

-- Solo transporta metadatos de auditoría. NestJS autentica y autoriza ANTES de llamarla.
-- El tercer argumento true de set_config limita el contexto a la transacción actual.
CREATE FUNCTION audit.set_request_context(p_actor uuid,p_auth_session uuid,p_request uuid)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF p_actor IS NULL OR p_auth_session IS NULL OR p_request IS NULL THEN
    RAISE EXCEPTION 'Actor, sesión de autenticación y petición son obligatorios' USING ERRCODE='22023';
  END IF;
  PERFORM set_config('app.actor_kind','human',true),set_config('app.actor_id',p_actor::text,true),
          set_config('app.auth_session_id',p_auth_session::text,true),set_config('app.request_id',p_request::text,true),
          set_config('app.system_actor','',true);
END $$;

CREATE FUNCTION audit.set_system_context(p_system_actor text,p_request uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_oid oid;
BEGIN
  SELECT nspowner INTO owner_oid FROM pg_namespace WHERE nspname='audit';
  IF NOT pg_has_role(session_user,owner_oid,'MEMBER') THEN
    RAISE EXCEPTION 'El contexto de sistema está reservado al propietario/migrador' USING ERRCODE='42501';
  END IF;
  IF p_request IS NULL OR p_system_actor IS NULL OR length(btrim(p_system_actor)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Identifique la tarea de sistema y su petición' USING ERRCODE='22023';
  END IF;
  PERFORM set_config('app.actor_kind','system',true),set_config('app.actor_id','',true),
          set_config('app.auth_session_id','',true),set_config('app.request_id',p_request::text,true),
          set_config('app.system_actor',p_system_actor,true);
END $$;

CREATE FUNCTION audit.context_values()
RETURNS TABLE(actor_kind text,actor_account_id uuid,auth_session_id uuid,request_id uuid,system_actor text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_oid oid;
BEGIN
  actor_kind := NULLIF(current_setting('app.actor_kind',true),'');
  actor_account_id := NULLIF(current_setting('app.actor_id',true),'')::uuid;
  auth_session_id := NULLIF(current_setting('app.auth_session_id',true),'')::uuid;
  request_id := NULLIF(current_setting('app.request_id',true),'')::uuid;
  system_actor := NULLIF(current_setting('app.system_actor',true),'');
  IF request_id IS NULL THEN
    RAISE EXCEPTION 'Falta el contexto transaccional de auditoría' USING ERRCODE='22023';
  END IF;
  IF actor_kind='human' THEN
    IF actor_account_id IS NULL OR auth_session_id IS NULL OR system_actor IS NOT NULL THEN
      RAISE EXCEPTION 'Contexto humano incompleto' USING ERRCODE='22023';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM iam.auth_session s WHERE s.id=auth_session_id AND s.account_id=actor_account_id) THEN
      RAISE EXCEPTION 'La sesión de acceso no pertenece a la cuenta indicada' USING ERRCODE='22023';
    END IF;
    -- Expiración, revocación y permisos se verifican en el guard del backend.
    -- La atribución debe funcionar también al registrar el cierre de esa sesión.
  ELSIF actor_kind='system' THEN
    SELECT nspowner INTO owner_oid FROM pg_namespace WHERE nspname='audit';
    IF NOT pg_has_role(session_user,owner_oid,'MEMBER') OR actor_account_id IS NOT NULL
       OR auth_session_id IS NOT NULL OR system_actor IS NULL OR length(btrim(system_actor))=0 THEN
      RAISE EXCEPTION 'Contexto de sistema no autorizado' USING ERRCODE='42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Tipo de actor de auditoría ausente o inválido' USING ERRCODE='22023';
  END IF;
  RETURN NEXT;
END $$;

-- Impide que un autor heredado de una modificación anterior se atribuya a la actual.
CREATE FUNCTION audit.stamp_authorship() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ctx record; item text; new_obj jsonb; old_obj jsonb; patch jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO STRICT ctx FROM audit.context_values();
  new_obj := to_jsonb(NEW);
  IF TG_OP='UPDATE' THEN old_obj := to_jsonb(OLD); END IF;
  IF TG_OP='UPDATE' AND new_obj->'id' IS DISTINCT FROM old_obj->'id' THEN
    RAISE EXCEPTION 'El identificador de un registro auditado es inmutable' USING ERRCODE='22023';
  END IF;
  FOREACH item IN ARRAY ARRAY['created_by_account_id','recorded_by_account_id','booked_by_account_id',
    'received_by_account_id','registered_by_account_id','assigned_by_account_id','granted_by_account_id',
    'linked_by_account_id','uploaded_by_account_id','entered_by_account_id','requested_by_account_id',
    'referred_by_account_id'] LOOP
    -- En un préstamo, received_by identifica a quien recibe el material devuelto,
    -- no a quien creó el registro. Es un responsable operativo distinto del autor.
    IF item='received_by_account_id' AND TG_TABLE_SCHEMA='evaluation' AND TG_TABLE_NAME='instrument_loan' THEN
      CONTINUE;
    END IF;
    IF new_obj ? item THEN
      IF TG_OP='INSERT' THEN
        patch := patch || jsonb_build_object(item,ctx.actor_account_id);
      ELSIF (new_obj->item) IS DISTINCT FROM (old_obj->item) THEN
        RAISE EXCEPTION 'No puede reescribir la autoría de creación: %',item USING ERRCODE='22023';
      END IF;
    END IF;
  END LOOP;
  IF new_obj ? 'created_by_system' THEN
    IF TG_OP='INSERT' THEN patch := patch || jsonb_build_object('created_by_system',ctx.system_actor);
    ELSIF new_obj->'created_by_system' IS DISTINCT FROM old_obj->'created_by_system' THEN
      RAISE EXCEPTION 'No puede reescribir el origen de sistema' USING ERRCODE='22023';
    END IF;
  END IF;
  IF TG_OP='UPDATE' AND new_obj ? 'created_at' AND new_obj->'created_at' IS DISTINCT FROM old_obj->'created_at' THEN
    RAISE EXCEPTION 'La fecha de creación es inmutable' USING ERRCODE='22023';
  END IF;
  IF new_obj ? 'updated_by_account_id' THEN patch := patch || jsonb_build_object('updated_by_account_id',ctx.actor_account_id); END IF;
  IF new_obj ? 'updated_by_system' THEN patch := patch || jsonb_build_object('updated_by_system',ctx.system_actor); END IF;
  IF TG_OP='UPDATE' AND new_obj ? 'revoked_by_account_id'
     AND old_obj->>'revoked_at' IS NULL AND new_obj->>'revoked_at' IS NOT NULL THEN
    patch := patch || jsonb_build_object('revoked_by_account_id',ctx.actor_account_id);
  END IF;
  IF TG_TABLE_SCHEMA='care' AND TG_TABLE_NAME='case_file' AND TG_OP='UPDATE'
     AND new_obj->'current_state_id' IS DISTINCT FROM old_obj->'current_state_id' THEN
    patch := patch || jsonb_build_object('state_changed_by_account_id',ctx.actor_account_id);
  END IF;
  NEW := jsonb_populate_record(NEW,patch);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION audit.record_row_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE old_obj jsonb := '{}'::jsonb; new_obj jsonb := '{}'::jsonb;
        key_name text; changed_names text[] := ARRAY[]::text[]; target_id uuid; ctx record;
BEGIN
  SELECT * INTO STRICT ctx FROM audit.context_values();
  IF TG_OP <> 'INSERT' THEN old_obj := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN new_obj := to_jsonb(NEW); END IF;
  FOR key_name IN SELECT jsonb_object_keys(old_obj || new_obj) ORDER BY 1 LOOP
    IF (old_obj->key_name) IS DISTINCT FROM (new_obj->key_name) THEN
      changed_names := array_append(changed_names,key_name);
    END IF;
  END LOOP;
  -- No producir un evento por cada actualización rutinaria de last_seen_at.
  IF TG_TABLE_SCHEMA='iam' AND TG_TABLE_NAME='auth_session' AND TG_OP='UPDATE'
     AND changed_names <@ ARRAY['last_seen_at']::text[] THEN RETURN NEW; END IF;
  target_id := COALESCE(NULLIF(new_obj->>'id',''),NULLIF(old_obj->>'id',''))::uuid;
  INSERT INTO audit.change_event(schema_name,table_name,row_id,operation,changed_column_names,
    actor_account_id,db_login_name,request_id,actor_kind,auth_session_id,system_actor)
  VALUES(TG_TABLE_SCHEMA,TG_TABLE_NAME,target_id,TG_OP,changed_names,ctx.actor_account_id,session_user,
    ctx.request_id,ctx.actor_kind,ctx.auth_session_id,ctx.system_actor);
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

-- Todos los objetos ya auditados reciben el sello antes que sus otros guards.
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT n.nspname,c.relname FROM pg_trigger tr
      JOIN pg_class c ON c.oid=tr.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE tr.tgname='audit_row_change' AND NOT tr.tgisinternal
        AND NOT (n.nspname='care' AND c.relname IN ('case_state_history','session_status_history'))
        AND NOT (n.nspname='agenda' AND c.relname='appointment_history') LOOP
    EXECUTE format('CREATE TRIGGER a00_request_authorship BEFORE INSERT OR UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION audit.stamp_authorship()',t.nspname,t.relname);
  END LOOP;
END $$;
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON iam.auth_session
  FOR EACH ROW EXECUTE FUNCTION audit.record_row_change();
CREATE TRIGGER prevent_hard_delete BEFORE DELETE ON iam.auth_session
  FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();

CREATE FUNCTION iam.protect_auth_session() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF ROW(NEW.id,NEW.account_id,NEW.token_hash,NEW.created_at) IS DISTINCT FROM
     ROW(OLD.id,OLD.account_id,OLD.token_hash,OLD.created_at) THEN
    RAISE EXCEPTION 'La identidad y el secreto de una sesión no se reescriben; crear una sesión nueva';
  END IF;
  IF NEW.expires_at > OLD.expires_at THEN RAISE EXCEPTION 'No extender una sesión existente; renovar con una nueva'; END IF;
  IF OLD.revoked_at IS NOT NULL AND ROW(NEW.revoked_at,NEW.revocation_reason) IS DISTINCT FROM ROW(OLD.revoked_at,OLD.revocation_reason) THEN
    RAISE EXCEPTION 'La revocación de sesión es irreversible';
  END IF;
  IF OLD.last_seen_at IS NOT NULL AND (NEW.last_seen_at IS NULL OR NEW.last_seen_at<OLD.last_seen_at) THEN
    RAISE EXCEPTION 'last_seen_at no puede retroceder';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER auth_session_identity_guard BEFORE UPDATE ON iam.auth_session FOR EACH ROW EXECUTE FUNCTION iam.protect_auth_session();

CREATE FUNCTION audit.log_access(p_action text,p_target_kind text,p_target_id uuid,p_succeeded boolean DEFAULT true)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ctx record; result_id bigint;
BEGIN
  SELECT * INTO STRICT ctx FROM audit.context_values();
  IF ctx.actor_kind <> 'human' THEN RAISE EXCEPTION 'Esta operación requiere cuenta y sesión de acceso'; END IF;
  INSERT INTO audit.access_event(actor_account_id,auth_session_id,action,target_kind,target_id,request_id,succeeded)
  VALUES(ctx.actor_account_id,ctx.auth_session_id,p_action,p_target_kind,p_target_id,ctx.request_id,p_succeeded)
  RETURNING id INTO result_id;
  RETURN result_id;
END $$;

-- 20. Concesiones de seguridad históricas: revocar y crear, nunca reasignar una fila.
ALTER TABLE iam.account_role ADD COLUMN revoked_by_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT;
ALTER TABLE iam.role_permission DROP CONSTRAINT role_permission_role_id_permission_id_key;
ALTER TABLE iam.role_permission
  ADD COLUMN granted_by_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  ADD COLUMN granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN revoked_by_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  ADD CONSTRAINT role_permission_revocation CHECK(revoked_at IS NULL OR (revoked_at>=granted_at AND revoked_by_account_id IS NOT NULL));
CREATE UNIQUE INDEX active_role_permission_uq ON iam.role_permission(role_id,permission_id) WHERE revoked_at IS NULL;
ALTER TABLE iam.account_role ADD CONSTRAINT account_role_revoker CHECK(revoked_at IS NULL OR revoked_by_account_id IS NOT NULL);

CREATE FUNCTION iam.protect_grant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE new_obj jsonb := to_jsonb(NEW); old_obj jsonb; key_name text; ctx record;
BEGIN
  SELECT * INTO STRICT ctx FROM audit.context_values();
  IF TG_OP='INSERT' THEN
    NEW.granted_at := clock_timestamp();
    IF NEW.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Una concesión nueva debe estar vigente'; END IF;
  ELSE
    old_obj := to_jsonb(OLD);
    FOREACH key_name IN ARRAY ARRAY['account_id','role_id','permission_id','granted_at'] LOOP
      IF new_obj ? key_name AND new_obj->key_name IS DISTINCT FROM old_obj->key_name THEN
        RAISE EXCEPTION 'No reasignar una concesión histórica: %',key_name;
      END IF;
    END LOOP;
    IF OLD.revoked_at IS NOT NULL AND ROW(NEW.revoked_at,NEW.revoked_by_account_id) IS DISTINCT FROM ROW(OLD.revoked_at,OLD.revoked_by_account_id) THEN
      RAISE EXCEPTION 'La revocación de permisos es irreversible';
    END IF;
    IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
      IF ctx.actor_account_id IS NULL THEN RAISE EXCEPTION 'Revocar requiere una cuenta responsable'; END IF;
      NEW.revoked_at := clock_timestamp(); NEW.revoked_by_account_id := ctx.actor_account_id;
    ELSIF OLD.revoked_at IS NULL THEN
      NEW.revoked_by_account_id := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER grant_history_guard BEFORE INSERT OR UPDATE ON iam.account_role FOR EACH ROW EXECUTE FUNCTION iam.protect_grant();
CREATE TRIGGER grant_history_guard BEFORE INSERT OR UPDATE ON iam.role_permission FOR EACH ROW EXECUTE FUNCTION iam.protect_grant();
CREATE TRIGGER prevent_hard_delete BEFORE DELETE ON iam.account_role FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();
CREATE TRIGGER prevent_hard_delete BEFORE DELETE ON iam.role_permission FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();

-- Esta vista resuelve permisos generales vigentes; no sustituye filtros por caso.
CREATE VIEW iam.v_effective_permission AS
SELECT DISTINCT ar.account_id,p.code AS permission_code
FROM iam.account_role ar JOIN iam.account a ON a.id=ar.account_id
JOIN iam.role r ON r.id=ar.role_id
JOIN iam.role_permission rp ON rp.role_id=r.id JOIN iam.permission p ON p.id=rp.permission_id
WHERE a.account_status='active' AND r.active AND p.active AND ar.revoked_at IS NULL AND rp.revoked_at IS NULL;

-- 21. Integridad en ambos extremos y protección del titular del consentimiento.
ALTER TABLE care.intake_request ADD CONSTRAINT intake_id_person_uq UNIQUE(id,person_id);
ALTER TABLE care.case_file ADD CONSTRAINT case_intake_person_fk FOREIGN KEY(intake_request_id,person_id)
  REFERENCES care.intake_request(id,person_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE FUNCTION care.protect_consent_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF ROW(NEW.person_id,NEW.case_id,NEW.consent_kind,NEW.recorded_at) IS DISTINCT FROM ROW(OLD.person_id,OLD.case_id,OLD.consent_kind,OLD.recorded_at) THEN
    RAISE EXCEPTION 'La identidad y el alcance de un consentimiento no se trasladan; registrar uno nuevo';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER consent_identity_guard BEFORE UPDATE ON care.consent_record FOR EACH ROW EXECUTE FUNCTION care.protect_consent_identity();

CREATE FUNCTION iam.protect_account_person() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.person_id IS DISTINCT FROM OLD.person_id THEN
    RAISE EXCEPTION 'Una cuenta no puede trasladarse a otra persona; registrar una identidad nueva';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER account_person_guard BEFORE UPDATE OF person_id ON iam.account FOR EACH ROW EXECUTE FUNCTION iam.protect_account_person();

CREATE FUNCTION practicum.protect_placement_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF ROW(NEW.student_person_id,NEW.term_id) IS DISTINCT FROM ROW(OLD.student_person_id,OLD.term_id) THEN
    RAISE EXCEPTION 'La identidad de estudiante y periodo de una práctica es inmutable; crear otra práctica';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER placement_identity_guard BEFORE UPDATE OF student_person_id,term_id ON practicum.placement
  FOR EACH ROW EXECUTE FUNCTION practicum.protect_placement_identity();

-- 22. Las horas aprobadas requieren aprobador y fecha; editar su contenido reinicia aprobación.
ALTER TABLE practicum.activity_log ADD CONSTRAINT activity_approval_evidence CHECK(
  approval_status <> 'approved' OR (approved_by_account_id IS NOT NULL AND approved_at IS NOT NULL));
CREATE FUNCTION practicum.guard_activity_approval() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ctx record; content_changed boolean := false;
BEGIN
  SELECT * INTO STRICT ctx FROM audit.context_values();
  IF TG_OP='UPDATE' THEN
    content_changed := ROW(NEW.placement_id,NEW.case_id,NEW.activity_kind,NEW.description,NEW.started_at,NEW.ended_at)
      IS DISTINCT FROM ROW(OLD.placement_id,OLD.case_id,OLD.activity_kind,OLD.description,OLD.started_at,OLD.ended_at);
  END IF;
  IF TG_OP='UPDATE' AND OLD.approval_status='approved' AND content_changed THEN
    NEW.approval_status := 'pending'; NEW.approved_by_account_id := NULL; NEW.approved_at := NULL;
  ELSIF NEW.approval_status='approved' THEN
    IF TG_OP='INSERT' OR OLD.approval_status <> 'approved' THEN
      IF ctx.actor_account_id IS NULL THEN RAISE EXCEPTION 'La aprobación requiere cuenta responsable'; END IF;
      NEW.approved_by_account_id := ctx.actor_account_id; NEW.approved_at := clock_timestamp();
    ELSE
      NEW.approved_by_account_id := OLD.approved_by_account_id; NEW.approved_at := OLD.approved_at;
    END IF;
  ELSE
    NEW.approved_by_account_id := NULL; NEW.approved_at := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER b10_activity_approval BEFORE INSERT OR UPDATE ON practicum.activity_log FOR EACH ROW EXECUTE FUNCTION practicum.guard_activity_approval();

-- 23. Orden determinista del histórico y versión para controlar escrituras concurrentes.
ALTER TABLE care.case_state_history
  ADD COLUMN event_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  ADD COLUMN case_version_no integer NOT NULL CHECK(case_version_no>0),
  ALTER COLUMN changed_at SET DEFAULT clock_timestamp(),
  ADD CONSTRAINT state_history_version_uq UNIQUE(case_id,case_version_no);
ALTER TABLE agenda.appointment_history ADD COLUMN event_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  ALTER COLUMN changed_at SET DEFAULT clock_timestamp();
ALTER TABLE care.session_status_history ADD COLUMN event_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  ALTER COLUMN changed_at SET DEFAULT clock_timestamp();

CREATE FUNCTION care.bump_case_version() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='INSERT' THEN NEW.version_no := 1; ELSE NEW.version_no := OLD.version_no+1; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER a10_case_version BEFORE INSERT OR UPDATE ON care.case_file FOR EACH ROW EXECUTE FUNCTION care.bump_case_version();
CREATE OR REPLACE FUNCTION care.record_state_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO care.case_state_history(case_id,from_state_id,to_state_id,changed_by_account_id,reason,case_version_no)
    VALUES(NEW.id,NULL,NEW.current_state_id,NEW.created_by_account_id,'Apertura del caso',NEW.version_no);
  ELSIF NEW.current_state_id IS DISTINCT FROM OLD.current_state_id THEN
    INSERT INTO care.case_state_history(case_id,from_state_id,to_state_id,changed_by_account_id,reason,case_version_no)
    VALUES(NEW.id,OLD.current_state_id,NEW.current_state_id,NEW.state_changed_by_account_id,NEW.state_change_reason,NEW.version_no);
  END IF;
  RETURN NEW;
END $$;

-- Los triggers pueden escribir histórico; el usuario runtime no lo hará directamente.
ALTER FUNCTION agenda.record_appointment_change() SECURITY DEFINER;
ALTER FUNCTION agenda.record_appointment_change() SET search_path=pg_catalog;
ALTER FUNCTION care.log_session_status_change() SECURITY DEFINER;
ALTER FUNCTION care.log_session_status_change() SET search_path=pg_catalog;

-- Revocar EXECUTE público no afecta la invocación automática de triggers ya creados.
DO $$ DECLARE schema_name text; BEGIN
  FOREACH schema_name IN ARRAY ARRAY['core','iam','care','agenda','evaluation','practicum','projects','quality','archive','reporting','audit'] LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC',schema_name);
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM PUBLIC',schema_name);
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM PUBLIC',schema_name);
    EXECUTE format('REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA %I FROM PUBLIC',schema_name);
  END LOOP;
END $$;
-- Aplicar después 02_privilegios_runtime.sql con un rol independiente creado en Neon.
-- No ejecutar NestJS con la credencial propietaria del esquema.

