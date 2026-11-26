import { pgSchema, index, foreignKey, unique, check, uuid, timestamp, varchar, inet, uniqueIndex, text, boolean, smallint, integer, bigint, jsonb, date, char, numeric } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { customType } from 'drizzle-orm/pg-core';
import type { PgTableExtraConfigValue } from 'drizzle-orm/pg-core';

const bytea = customType<{
  data: Buffer;
  driverData: Buffer;
}>({
  dataType() {
    return 'bytea';
  },
});


export const iam = pgSchema("iam");
export const care = pgSchema("care");
export const audit = pgSchema("audit");
export const agenda = pgSchema("agenda");
export const evaluation = pgSchema("evaluation");
export const practicum = pgSchema("practicum");
export const projects = pgSchema("projects");
export const quality = pgSchema("quality");
export const archive = pgSchema("archive");
export const reporting = pgSchema("reporting");
export const core = pgSchema("core");


export const authSessionInIam = iam.table("auth_session", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	sessionKind: varchar("session_kind", { length: 30 }).default('interactive').notNull(),
	// TODO: failed to parse database type 'bytea'
	tokenHash: bytea("token_hash").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`clock_timestamp()`).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: 'string' }),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'string' }),
	revocationReason: varchar("revocation_reason", { length: 100 }),
	clientIp: inet("client_ip"),
	userAgent: varchar("user_agent", { length: 512 }),
}, (table) => [
	index("auth_session_account_idx").using("btree", table.accountId.asc().nullsLast(), table.createdAt.desc().nullsFirst()),
	index("auth_session_live_idx").using("btree", table.accountId.asc().nullsLast(), table.expiresAt.asc().nullsLast()).where(sql`(revoked_at IS NULL)`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountInIam.id],
			name: "auth_session_account_id_fkey"
		}).onDelete("restrict"),
	unique("auth_session_token_hash_key").on(table.tokenHash),
	unique("auth_session_id_account_id_key").on(table.accountId, table.id),
	check("auth_session_check", sql`expires_at > created_at`),
	check("auth_session_check1", sql`(last_seen_at IS NULL) OR (last_seen_at >= created_at)`),
	check("auth_session_check2", sql`(revoked_at IS NULL) OR (revoked_at >= created_at)`),
	check("auth_session_token_hash_check", sql`octet_length(token_hash) = 32`),
	check("auth_session_kind_check", sql`session_kind IN ('interactive','account_activation','password_reset')`),
	check("action_session_is_closed", sql`session_kind='interactive' OR revoked_at IS NOT NULL`),
]);

export const securityEventInAudit = audit.table('security_event', {
  id: bigint({ mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity({ name: 'audit.security_event_id_seq' }),
  occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' }).default(sql`clock_timestamp()`).notNull(),
  requestId: uuid('request_id').notNull(),
  eventType: varchar('event_type', { length: 30 }).notNull(),
  subjectHash: bytea('subject_hash').notNull(),
  actorAccountId: uuid('actor_account_id'),
  authSessionId: uuid('auth_session_id'),
}, (table): PgTableExtraConfigValue[] => [
  index('security_subject_failure_idx').on(table.subjectHash, table.occurredAt.desc()).where(sql`event_type='sign_in_failed'`),
  index('security_actor_time_idx').on(table.actorAccountId, table.occurredAt.desc()),
  foreignKey({ columns: [table.actorAccountId], foreignColumns: [accountInIam.id], name: 'security_event_actor_account_id_fkey' }).onDelete('restrict'),
  foreignKey({ columns: [table.authSessionId, table.actorAccountId], foreignColumns: [authSessionInIam.id, authSessionInIam.accountId], name: 'security_session_owner' }).onDelete('restrict'),
  check('security_event_event_type_check', sql`event_type IN ('sign_in_succeeded','sign_in_failed','sign_in_throttled','sign_out_succeeded')`),
  check('security_event_subject_hash_check', sql`octet_length(subject_hash)=32`),
  check('security_actor_check', sql`(event_type IN ('sign_in_failed','sign_in_throttled') AND actor_account_id IS NULL AND auth_session_id IS NULL) OR (event_type IN ('sign_in_succeeded','sign_out_succeeded') AND actor_account_id IS NOT NULL AND auth_session_id IS NOT NULL)`),
]);

export const accountInIam = iam.table("account", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	personId: uuid("person_id").notNull(),
	email: varchar({ length: 254 }).notNull(),
	username: varchar({ length: 80 }),
	authMethod: varchar("auth_method", { length: 25 }).default('local').notNull(),
	externalSubject: varchar("external_subject", { length: 255 }),
	passwordHash: text("password_hash"),
	accountStatus: varchar("account_status", { length: 20 }).default('invited').notNull(),
	lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: 'string' }),
	mfaEnabled: boolean("mfa_enabled").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdByAccountId: uuid("created_by_account_id"),
	createdBySystem: varchar("created_by_system", { length: 100 }),
	updatedByAccountId: uuid("updated_by_account_id"),
	updatedBySystem: varchar("updated_by_system", { length: 100 }),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("account_email_normalized_uq").using("btree", sql`lower((email)::text)`),
	uniqueIndex("account_sso_subject_uq").using("btree", table.externalSubject.asc().nullsLast()).where(sql`(((auth_method)::text = 'institutional_sso'::text) AND (external_subject IS NOT NULL))`),
	uniqueIndex("account_username_normalized_uq").using("btree", sql`lower((username)::text)`).where(sql`(username IS NOT NULL)`),
	foreignKey({
			columns: [table.createdByAccountId],
			foreignColumns: [table.id],
			name: "account_created_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.personId],
			foreignColumns: [personInCore.id],
			name: "account_person_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.updatedByAccountId],
			foreignColumns: [table.id],
			name: "account_updated_by_account_id_fkey"
		}).onDelete("restrict"),
	unique("account_person_id_key").on(table.personId),
	check("account_account_status_check", sql`(account_status)::text = ANY ((ARRAY['invited'::character varying, 'active'::character varying, 'disabled'::character varying])::text[])`),
	check("account_auth_method_check", sql`(auth_method)::text = ANY ((ARRAY['local'::character varying, 'institutional_sso'::character varying])::text[])`),
	check("account_username_nonempty", sql`(username IS NULL) OR (length(TRIM(BOTH FROM username)) >= 3)`),
	check("active_local_account_needs_password", sql`((account_status)::text <> 'active'::text) OR ((auth_method)::text <> 'local'::text) OR ((password_hash IS NOT NULL) AND (length(password_hash) > 0))`),
	check("active_sso_account_needs_subject", sql`((account_status)::text <> 'active'::text) OR ((auth_method)::text <> 'institutional_sso'::text) OR ((external_subject IS NOT NULL) AND (length(TRIM(BOTH FROM external_subject)) > 0))`),
	check("author_origin_required", sql`num_nonnulls(created_by_account_id, created_by_system) = 1`),
	check("local_account_no_external_subject", sql`((auth_method)::text <> 'local'::text) OR (external_subject IS NULL)`),
]);

export const roleInIam = iam.table("role", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: varchar({ length: 60 }).notNull(),
	label: varchar({ length: 100 }).notNull(),
	description: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdByAccountId: uuid("created_by_account_id"),
	createdBySystem: varchar("created_by_system", { length: 100 }),
	updatedByAccountId: uuid("updated_by_account_id"),
	updatedBySystem: varchar("updated_by_system", { length: 100 }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`clock_timestamp()`).notNull(),
	active: boolean().default(true).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.createdByAccountId],
			foreignColumns: [accountInIam.id],
			name: "role_created_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.updatedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "role_updated_by_account_id_fkey"
		}).onDelete("restrict"),
	unique("role_code_key").on(table.code),
	check("author_origin_required", sql`num_nonnulls(created_by_account_id, created_by_system) = 1`),
]);

export const permissionInIam = iam.table("permission", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: varchar({ length: 100 }).notNull(),
	description: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdByAccountId: uuid("created_by_account_id"),
	createdBySystem: varchar("created_by_system", { length: 100 }),
	updatedByAccountId: uuid("updated_by_account_id"),
	updatedBySystem: varchar("updated_by_system", { length: 100 }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`clock_timestamp()`).notNull(),
	active: boolean().default(true).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.createdByAccountId],
			foreignColumns: [accountInIam.id],
			name: "permission_created_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.updatedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "permission_updated_by_account_id_fkey"
		}).onDelete("restrict"),
	unique("permission_code_key").on(table.code),
	check("author_origin_required", sql`num_nonnulls(created_by_account_id, created_by_system) = 1`),
]);

export const rolePermissionInIam = iam.table("role_permission", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	roleId: uuid("role_id").notNull(),
	permissionId: uuid("permission_id").notNull(),
	grantedByAccountId: uuid("granted_by_account_id"),
	grantedAt: timestamp("granted_at", { withTimezone: true, mode: 'string' }).default(sql`clock_timestamp()`).notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'string' }),
	revokedByAccountId: uuid("revoked_by_account_id"),
}, (table) => [
	uniqueIndex("active_role_permission_uq").using("btree", table.roleId.asc().nullsLast(), table.permissionId.asc().nullsLast()).where(sql`(revoked_at IS NULL)`),
	foreignKey({
			columns: [table.grantedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "role_permission_granted_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.permissionId],
			foreignColumns: [permissionInIam.id],
			name: "role_permission_permission_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.revokedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "role_permission_revoked_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.roleId],
			foreignColumns: [roleInIam.id],
			name: "role_permission_role_id_fkey"
		}).onDelete("restrict"),
	check("role_permission_revocation", sql`(revoked_at IS NULL) OR ((revoked_at >= granted_at) AND (revoked_by_account_id IS NOT NULL))`),
]);

export const accountRoleInIam = iam.table("account_role", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	accountId: uuid("account_id").notNull(),
	roleId: uuid("role_id").notNull(),
	grantedByAccountId: uuid("granted_by_account_id"),
	grantedAt: timestamp("granted_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'string' }),
	revokedByAccountId: uuid("revoked_by_account_id"),
}, (table) => [
	index("account_role_account_idx").using("btree", table.accountId.asc().nullsLast()),
	uniqueIndex("active_account_role_uq").using("btree", table.accountId.asc().nullsLast(), table.roleId.asc().nullsLast()).where(sql`(revoked_at IS NULL)`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountInIam.id],
			name: "account_role_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.grantedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "account_role_granted_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.revokedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "account_role_revoked_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.roleId],
			foreignColumns: [roleInIam.id],
			name: "account_role_role_id_fkey"
		}).onDelete("restrict"),
	check("account_role_check", sql`(revoked_at IS NULL) OR (revoked_at >= granted_at)`),
	check("account_role_revoker", sql`(revoked_at IS NULL) OR (revoked_by_account_id IS NOT NULL)`),
]);

export const intakeRequestInCare = care.table("intake_request", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	personId: uuid("person_id").notNull(),
	originatingInstitutionId: uuid("originating_institution_id"),
	receivedAt: timestamp("received_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	sourceChannel: varchar("source_channel", { length: 30 }).notNull(),
	externalReference: varchar("external_reference", { length: 120 }),
	reasonId: uuid("reason_id"),
	requestSummary: text("request_summary"),
	ageAtIntakeReported: smallint("age_at_intake_reported"),
	reportedUrgency: varchar("reported_urgency", { length: 30 }),
	urgencyRecordedByAccountId: uuid("urgency_recorded_by_account_id"),
	requestStatus: varchar("request_status", { length: 20 }).default('received').notNull(),
	receivedByAccountId: uuid("received_by_account_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("intake_person_idx").using("btree", table.personId.asc().nullsLast()),
	index("intake_status_received_idx").using("btree", table.requestStatus.asc().nullsLast(), table.receivedAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.originatingInstitutionId],
			foreignColumns: [institutionInCore.id],
			name: "intake_request_originating_institution_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.personId],
			foreignColumns: [personInCore.id],
			name: "intake_request_person_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.reasonId],
			foreignColumns: [consultationReasonInCare.id],
			name: "intake_request_reason_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.receivedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "intake_request_received_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.urgencyRecordedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "intake_request_urgency_recorded_by_account_id_fkey"
		}).onDelete("restrict"),
	unique("intake_id_person_uq").on(table.id, table.personId),
	check("intake_request_age_at_intake_reported_check", sql`(age_at_intake_reported >= 0) AND (age_at_intake_reported <= 120)`),
	check("intake_request_request_status_check", sql`(request_status)::text = ANY ((ARRAY['received'::character varying, 'under_review'::character varying, 'accepted'::character varying, 'rejected'::character varying, 'cancelled'::character varying])::text[])`),
	check("intake_request_source_channel_check", sql`(source_channel)::text = ANY ((ARRAY['institutional_email'::character varying, 'online_form'::character varying, 'qr_form'::character varying, 'in_person'::character varying, 'phone'::character varying, 'other'::character varying])::text[])`),
]);

export const consultationReasonInCare = care.table("consultation_reason", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: varchar({ length: 50 }).notNull(),
	name: varchar({ length: 140 }).notNull(),
	active: boolean().default(true).notNull(),
}, (table) => [
	unique("consultation_reason_code_key").on(table.code),
]);

export const caseStateInCare = care.table("case_state", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: varchar({ length: 50 }).notNull(),
	label: varchar({ length: 120 }).notNull(),
	isTerminal: boolean("is_terminal").default(false).notNull(),
	sortOrder: smallint("sort_order").default(0).notNull(),
	active: boolean().default(true).notNull(),
}, (table) => [
	unique("case_state_code_key").on(table.code),
]);

export const allowedStateTransitionInCare = care.table("allowed_state_transition", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	fromStateId: uuid("from_state_id").notNull(),
	toStateId: uuid("to_state_id").notNull(),
	active: boolean().default(true).notNull(),
	description: varchar({ length: 250 }),
}, (table) => [
	foreignKey({
			columns: [table.fromStateId],
			foreignColumns: [caseStateInCare.id],
			name: "allowed_state_transition_from_state_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.toStateId],
			foreignColumns: [caseStateInCare.id],
			name: "allowed_state_transition_to_state_id_fkey"
		}).onDelete("restrict"),
	unique("allowed_state_transition_from_state_id_to_state_id_key").on(table.fromStateId, table.toStateId),
	check("allowed_state_transition_check", sql`from_state_id <> to_state_id`),
]);

export const caseFileInCare = care.table("case_file", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseNumber: varchar("case_number", { length: 45 }).notNull(),
	personId: uuid("person_id").notNull(),
	intakeRequestId: uuid("intake_request_id"),
	serviceTypeId: uuid("service_type_id").notNull(),
	primaryReasonId: uuid("primary_reason_id"),
	currentStateId: uuid("current_state_id").notNull(),
	openedAt: timestamp("opened_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	closedAt: timestamp("closed_at", { withTimezone: true, mode: 'string' }),
	operationalSummary: text("operational_summary"),
	createdByAccountId: uuid("created_by_account_id").notNull(),
	updatedByAccountId: uuid("updated_by_account_id"),
	stateChangedByAccountId: uuid("state_changed_by_account_id"),
	stateChangeReason: text("state_change_reason"),
	versionNo: integer("version_no").default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("case_person_opened_idx").using("btree", table.personId.asc().nullsLast(), table.openedAt.desc().nullsFirst()),
	index("case_service_idx").using("btree", table.serviceTypeId.asc().nullsLast()),
	index("case_state_idx").using("btree", table.currentStateId.asc().nullsLast()),
	foreignKey({
			columns: [table.createdByAccountId],
			foreignColumns: [accountInIam.id],
			name: "case_file_created_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.currentStateId],
			foreignColumns: [caseStateInCare.id],
			name: "case_file_current_state_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.intakeRequestId],
			foreignColumns: [intakeRequestInCare.id],
			name: "case_file_intake_request_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.personId],
			foreignColumns: [personInCore.id],
			name: "case_file_person_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.primaryReasonId],
			foreignColumns: [consultationReasonInCare.id],
			name: "case_file_primary_reason_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.serviceTypeId],
			foreignColumns: [serviceTypeInCare.id],
			name: "case_file_service_type_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.stateChangedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "case_file_state_changed_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.updatedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "case_file_updated_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.intakeRequestId, table.personId],
			foreignColumns: [intakeRequestInCare.id, intakeRequestInCare.personId],
			name: "case_intake_person_fk"
		}).onUpdate("restrict").onDelete("restrict"),
	unique("case_file_case_number_key").on(table.caseNumber),
	unique("case_file_intake_request_id_key").on(table.intakeRequestId),
	check("case_file_check", sql`(closed_at IS NULL) OR (closed_at >= opened_at)`),
	check("case_file_version_no_check", sql`version_no > 0`),
]);

export const serviceTypeInCare = care.table("service_type", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: varchar({ length: 45 }).notNull(),
	name: varchar({ length: 120 }).notNull(),
	active: boolean().default(true).notNull(),
}, (table) => [
	unique("service_type_code_key").on(table.code),
]);

export const caseParticipantInCare = care.table("case_participant", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	personId: uuid("person_id").notNull(),
	participationRole: varchar("participation_role", { length: 30 }).notNull(),
	joinedAt: timestamp("joined_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	leftAt: timestamp("left_at", { withTimezone: true, mode: 'string' }),
	registeredByAccountId: uuid("registered_by_account_id").notNull(),
}, (table) => [
	uniqueIndex("active_case_participant_uq").using("btree", table.caseId.asc().nullsLast(), table.personId.asc().nullsLast()).where(sql`(left_at IS NULL)`),
	index("case_participant_person_idx").using("btree", table.personId.asc().nullsLast()),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [caseFileInCare.id],
			name: "case_participant_case_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.personId],
			foreignColumns: [personInCore.id],
			name: "case_participant_person_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.registeredByAccountId],
			foreignColumns: [accountInIam.id],
			name: "case_participant_registered_by_account_id_fkey"
		}).onDelete("restrict"),
	check("case_participant_check", sql`(left_at IS NULL) OR (left_at >= joined_at)`),
	check("case_participant_participation_role_check", sql`(participation_role)::text = ANY ((ARRAY['partner'::character varying, 'family_member'::character varying, 'guardian'::character varying, 'other'::character varying])::text[])`),
]);

export const caseAssignmentInCare = care.table("case_assignment", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	accountId: uuid("account_id").notNull(),
	assignmentKind: varchar("assignment_kind", { length: 22 }).notNull(),
	assignedAt: timestamp("assigned_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	releasedAt: timestamp("released_at", { withTimezone: true, mode: 'string' }),
	assignedByAccountId: uuid("assigned_by_account_id").notNull(),
}, (table) => [
	index("active_case_assignment_idx").using("btree", table.accountId.asc().nullsLast(), table.caseId.asc().nullsLast()).where(sql`(released_at IS NULL)`),
	uniqueIndex("one_active_responsible_per_case").using("btree", table.caseId.asc().nullsLast()).where(sql`(((assignment_kind)::text = 'responsible'::text) AND (released_at IS NULL))`),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accountInIam.id],
			name: "case_assignment_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.assignedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "case_assignment_assigned_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [caseFileInCare.id],
			name: "case_assignment_case_id_fkey"
		}).onDelete("restrict"),
	check("case_assignment_assignment_kind_check", sql`(assignment_kind)::text = ANY ((ARRAY['responsible'::character varying, 'support'::character varying, 'supervisor'::character varying])::text[])`),
	check("case_assignment_check", sql`(released_at IS NULL) OR (released_at >= assigned_at)`),
]);

export const caseReferralInCare = care.table("case_referral", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	kind: varchar({ length: 15 }).notNull(),
	destinationInstitutionId: uuid("destination_institution_id"),
	referredToAccountId: uuid("referred_to_account_id"),
	description: text(),
	referralStatus: varchar("referral_status", { length: 20 }).default('sent').notNull(),
	referredAt: timestamp("referred_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	referredByAccountId: uuid("referred_by_account_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("referral_case_idx").using("btree", table.caseId.asc().nullsLast(), table.referredAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [caseFileInCare.id],
			name: "case_referral_case_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.destinationInstitutionId],
			foreignColumns: [institutionInCore.id],
			name: "case_referral_destination_institution_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.referredByAccountId],
			foreignColumns: [accountInIam.id],
			name: "case_referral_referred_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.referredToAccountId],
			foreignColumns: [accountInIam.id],
			name: "case_referral_referred_to_account_id_fkey"
		}).onDelete("restrict"),
	check("case_referral_check", sql`(destination_institution_id IS NOT NULL) OR (referred_to_account_id IS NOT NULL)`),
	check("case_referral_kind_check", sql`(kind)::text = ANY ((ARRAY['internal'::character varying, 'external'::character varying])::text[])`),
	check("case_referral_referral_status_check", sql`(referral_status)::text = ANY ((ARRAY['draft'::character varying, 'sent'::character varying, 'accepted'::character varying, 'declined'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[])`),
]);

export const consentRecordInCare = care.table("consent_record", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	personId: uuid("person_id").notNull(),
	caseId: uuid("case_id"),
	consentKind: varchar("consent_kind", { length: 60 }).notNull(),
	consentStatus: varchar("consent_status", { length: 15 }).notNull(),
	recordedAt: timestamp("recorded_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	effectiveAt: timestamp("effective_at", { withTimezone: true, mode: 'string' }),
	recordedByAccountId: uuid("recorded_by_account_id").notNull(),
	remarks: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [caseFileInCare.id],
			name: "consent_record_case_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.personId],
			foreignColumns: [personInCore.id],
			name: "consent_record_person_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.recordedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "consent_record_recorded_by_account_id_fkey"
		}).onDelete("restrict"),
	check("consent_record_consent_status_check", sql`(consent_status)::text = ANY ((ARRAY['granted'::character varying, 'revoked'::character varying, 'declined'::character varying])::text[])`),
]);

export const sessionRecordInCare = care.table("session_record", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	appointmentId: uuid("appointment_id"),
	professionalAccountId: uuid("professional_account_id").notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).notNull(),
	endedAt: timestamp("ended_at", { withTimezone: true, mode: 'string' }),
	sessionStatus: varchar("session_status", { length: 18 }).default('completed').notNull(),
	operationalObservation: text("operational_observation"),
	recordedByAccountId: uuid("recorded_by_account_id").notNull(),
	updatedByAccountId: uuid("updated_by_account_id"),
	changeReason: text("change_reason"),
	verifiedByAccountId: uuid("verified_by_account_id"),
	verifiedAt: timestamp("verified_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("session_case_time_idx").using("btree", table.caseId.asc().nullsLast(), table.startedAt.desc().nullsFirst()),
	uniqueIndex("session_deduplicate_active_idx").using("btree", table.caseId.asc().nullsLast(), table.professionalAccountId.asc().nullsLast(), table.startedAt.asc().nullsLast()).where(sql`((session_status)::text <> 'voided'::text)`),
	index("session_prof_time_idx").using("btree", table.professionalAccountId.asc().nullsLast(), table.startedAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.appointmentId, table.caseId],
			foreignColumns: [appointmentInAgenda.id, appointmentInAgenda.caseId],
			name: "session_record_appointment_id_case_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [caseFileInCare.id],
			name: "session_record_case_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.professionalAccountId],
			foreignColumns: [accountInIam.id],
			name: "session_record_professional_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.recordedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "session_record_recorded_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.updatedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "session_record_updated_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.verifiedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "session_record_verified_by_account_id_fkey"
		}).onDelete("restrict"),
	unique("session_record_appointment_id_key").on(table.appointmentId),
	unique("session_record_id_case_id_key").on(table.caseId, table.id),
	check("session_record_check", sql`(ended_at IS NULL) OR (ended_at > started_at)`),
	check("session_record_check1", sql`(verified_at IS NULL) OR (verified_by_account_id IS NOT NULL)`),
	check("session_record_session_status_check", sql`(session_status)::text = ANY ((ARRAY['completed'::character varying, 'voided'::character varying, 'incomplete'::character varying])::text[])`),
]);

export const caseStateHistoryInCare = care.table("case_state_history", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	fromStateId: uuid("from_state_id"),
	toStateId: uuid("to_state_id").notNull(),
	changedByAccountId: uuid("changed_by_account_id").notNull(),
	reason: text(),
	changedAt: timestamp("changed_at", { withTimezone: true, mode: 'string' }).default(sql`clock_timestamp()`).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	eventNo: bigint("event_no", { mode: "number" }).generatedAlwaysAsIdentity({ name: "care.case_state_history_event_no_seq", startWith: 1, increment: 1, minValue: 1, maxValue: "9223372036854775807", cache: 1 }),
	caseVersionNo: integer("case_version_no").notNull(),
}, (table) => [
	index("case_state_history_idx").using("btree", table.caseId.asc().nullsLast(), table.changedAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [caseFileInCare.id],
			name: "case_state_history_case_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.changedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "case_state_history_changed_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.fromStateId],
			foreignColumns: [caseStateInCare.id],
			name: "case_state_history_from_state_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.toStateId],
			foreignColumns: [caseStateInCare.id],
			name: "case_state_history_to_state_id_fkey"
		}).onDelete("restrict"),
	unique("case_state_history_event_no_key").on(table.eventNo),
	unique("state_history_version_uq").on(table.caseId, table.caseVersionNo),
	check("case_state_history_case_version_no_check", sql`case_version_no > 0`),
]);

export const sessionStatusHistoryInCare = care.table("session_status_history", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sessionId: uuid("session_id").notNull(),
	previousStatus: varchar("previous_status", { length: 18 }).notNull(),
	newStatus: varchar("new_status", { length: 18 }).notNull(),
	changedByAccountId: uuid("changed_by_account_id").notNull(),
	reason: text(),
	changedAt: timestamp("changed_at", { withTimezone: true, mode: 'string' }).default(sql`clock_timestamp()`).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	eventNo: bigint("event_no", { mode: "number" }).generatedAlwaysAsIdentity({ name: "care.session_status_history_event_no_seq", startWith: 1, increment: 1, minValue: 1, maxValue: "9223372036854775807", cache: 1 }),
}, (table) => [
	index("session_status_history_idx").using("btree", table.sessionId.asc().nullsLast(), table.changedAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.changedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "session_status_history_changed_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [sessionRecordInCare.id],
			name: "session_status_history_session_id_fkey"
		}).onDelete("restrict"),
	unique("session_status_history_event_no_key").on(table.eventNo),
	check("session_status_history_check", sql`(previous_status)::text <> (new_status)::text`),
]);

export const appointmentInAgenda = agenda.table("appointment", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id"),
	roomId: uuid("room_id"),
	professionalAccountId: uuid("professional_account_id"),
	bookedByAccountId: uuid("booked_by_account_id").notNull(),
	appointmentKind: varchar("appointment_kind", { length: 25 }).notNull(),
	title: varchar({ length: 200 }),
	startsAt: timestamp("starts_at", { withTimezone: true, mode: 'string' }).notNull(),
	endsAt: timestamp("ends_at", { withTimezone: true, mode: 'string' }).notNull(),
	appointmentStatus: varchar("appointment_status", { length: 20 }).default('scheduled').notNull(),
	cancellationReason: text("cancellation_reason"),
	updatedByAccountId: uuid("updated_by_account_id"),
	changeReason: text("change_reason"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("appointment_calendar_idx").using("btree", table.startsAt.asc().nullsLast(), table.appointmentStatus.asc().nullsLast()),
	index("appointment_case_idx").using("btree", table.caseId.asc().nullsLast(), table.startsAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.bookedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "appointment_booked_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [caseFileInCare.id],
			name: "appointment_case_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.professionalAccountId],
			foreignColumns: [accountInIam.id],
			name: "appointment_professional_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.roomId],
			foreignColumns: [roomInAgenda.id],
			name: "appointment_room_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.updatedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "appointment_updated_by_account_id_fkey"
		}).onDelete("restrict"),
	unique("appointment_id_case_id_key").on(table.caseId, table.id),
	check("appointment_appointment_kind_check", sql`(appointment_kind)::text = ANY ((ARRAY['session'::character varying, 'evaluation'::character varying, 'interview'::character varying, 'practice'::character varying, 'workshop'::character varying, 'institutional'::character varying, 'other'::character varying])::text[])`),
	check("appointment_appointment_status_check", sql`(appointment_status)::text = ANY ((ARRAY['scheduled'::character varying, 'confirmed'::character varying, 'completed'::character varying, 'cancelled'::character varying, 'no_show'::character varying])::text[])`),
	check("appointment_check", sql`ends_at > starts_at`),
]);

export const evaluationProcessInEvaluation = evaluation.table("evaluation_process", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	responsibleAccountId: uuid("responsible_account_id").notNull(),
	evaluationKind: varchar("evaluation_kind", { length: 60 }).notNull(),
	processStatus: varchar("process_status", { length: 24 }).default('pending').notNull(),
	requestedAt: timestamp("requested_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	operationalFindings: text("operational_findings"),
	createdByAccountId: uuid("created_by_account_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("evaluation_case_idx").using("btree", table.caseId.asc().nullsLast(), table.requestedAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [caseFileInCare.id],
			name: "evaluation_process_case_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.createdByAccountId],
			foreignColumns: [accountInIam.id],
			name: "evaluation_process_created_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.responsibleAccountId],
			foreignColumns: [accountInIam.id],
			name: "evaluation_process_responsible_account_id_fkey"
		}).onDelete("restrict"),
	check("evaluation_process_check", sql`(completed_at IS NULL) OR (completed_at >= requested_at)`),
	check("evaluation_process_process_status_check", sql`(process_status)::text = ANY ((ARRAY['pending'::character varying, 'in_progress'::character varying, 'report_prepared'::character varying, 'follow_up'::character varying, 'closed'::character varying, 'cancelled'::character varying])::text[])`),
]);

export const instrumentApplicationInEvaluation = evaluation.table("instrument_application", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	evaluationId: uuid("evaluation_id").notNull(),
	instrumentId: uuid("instrument_id").notNull(),
	appliedByAccountId: uuid("applied_by_account_id").notNull(),
	appliedAt: timestamp("applied_at", { withTimezone: true, mode: 'string' }),
	resultSummary: text("result_summary"),
	structuredResult: jsonb("structured_result"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("instrument_application_evaluation_idx").using("btree", table.evaluationId.asc().nullsLast()),
	foreignKey({
			columns: [table.appliedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "instrument_application_applied_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.evaluationId],
			foreignColumns: [evaluationProcessInEvaluation.id],
			name: "instrument_application_evaluation_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.instrumentId],
			foreignColumns: [instrumentInEvaluation.id],
			name: "instrument_application_instrument_id_fkey"
		}).onDelete("restrict"),
	check("instrument_application_structured_result_check", sql`(structured_result IS NULL) OR (jsonb_typeof(structured_result) = 'object'::text)`),
]);

export const placementInPracticum = practicum.table("placement", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	studentPersonId: uuid("student_person_id").notNull(),
	termId: uuid("term_id").notNull(),
	supervisorAccountId: uuid("supervisor_account_id").notNull(),
	placementKind: varchar("placement_kind", { length: 25 }).notNull(),
	startedOn: date("started_on"),
	endedOn: date("ended_on"),
	placementStatus: varchar("placement_status", { length: 20 }).default('planned').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("placement_student_term_idx").using("btree", table.studentPersonId.asc().nullsLast(), table.termId.asc().nullsLast()),
	foreignKey({
			columns: [table.studentPersonId],
			foreignColumns: [personInCore.id],
			name: "placement_student_person_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.supervisorAccountId],
			foreignColumns: [accountInIam.id],
			name: "placement_supervisor_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.termId],
			foreignColumns: [academicTermInPracticum.id],
			name: "placement_term_id_fkey"
		}).onDelete("restrict"),
	check("placement_check", sql`(ended_on IS NULL) OR (started_on IS NULL) OR (ended_on >= started_on)`),
	check("placement_placement_kind_check", sql`(placement_kind)::text = ANY ((ARRAY['assistant'::character varying, 'intern'::character varying, 'course_practice'::character varying, 'other'::character varying])::text[])`),
	check("placement_placement_status_check", sql`(placement_status)::text = ANY ((ARRAY['planned'::character varying, 'active'::character varying, 'completed'::character varying, 'withdrawn'::character varying])::text[])`),
]);

export const academicTermInPracticum = practicum.table("academic_term", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: varchar({ length: 30 }).notNull(),
	label: varchar({ length: 90 }).notNull(),
	startsOn: date("starts_on").notNull(),
	endsOn: date("ends_on").notNull(),
}, (table) => [
	unique("academic_term_code_key").on(table.code),
	check("academic_term_check", sql`ends_on >= starts_on`),
]);

export const placementCaseInPracticum = practicum.table("placement_case", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	placementId: uuid("placement_id").notNull(),
	caseId: uuid("case_id").notNull(),
	assignedByAccountId: uuid("assigned_by_account_id").notNull(),
	assignedAt: timestamp("assigned_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	releasedAt: timestamp("released_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	uniqueIndex("active_placement_case_uq").using("btree", table.placementId.asc().nullsLast(), table.caseId.asc().nullsLast()).where(sql`(released_at IS NULL)`),
	foreignKey({
			columns: [table.assignedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "placement_case_assigned_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [caseFileInCare.id],
			name: "placement_case_case_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.placementId],
			foreignColumns: [placementInPracticum.id],
			name: "placement_case_placement_id_fkey"
		}).onDelete("restrict"),
	check("placement_case_check", sql`(released_at IS NULL) OR (released_at >= assigned_at)`),
]);

export const supervisionInPracticum = practicum.table("supervision", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	placementId: uuid("placement_id").notNull(),
	supervisorAccountId: uuid("supervisor_account_id").notNull(),
	supervisedAt: timestamp("supervised_at", { withTimezone: true, mode: 'string' }).notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.placementId],
			foreignColumns: [placementInPracticum.id],
			name: "supervision_placement_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.supervisorAccountId],
			foreignColumns: [accountInIam.id],
			name: "supervision_supervisor_account_id_fkey"
		}).onDelete("restrict"),
]);

export const performanceReviewInPracticum = practicum.table("performance_review", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	placementId: uuid("placement_id").notNull(),
	reviewerAccountId: uuid("reviewer_account_id").notNull(),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	assessmentSummary: text("assessment_summary"),
	approved: boolean(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.placementId],
			foreignColumns: [placementInPracticum.id],
			name: "performance_review_placement_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.reviewerAccountId],
			foreignColumns: [accountInIam.id],
			name: "performance_review_reviewer_account_id_fkey"
		}).onDelete("restrict"),
]);

export const activityLogInPracticum = practicum.table("activity_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	placementId: uuid("placement_id").notNull(),
	caseId: uuid("case_id"),
	activityKind: varchar("activity_kind", { length: 70 }).notNull(),
	description: text(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).notNull(),
	endedAt: timestamp("ended_at", { withTimezone: true, mode: 'string' }).notNull(),
	approvalStatus: varchar("approval_status", { length: 18 }).default('pending').notNull(),
	approvedByAccountId: uuid("approved_by_account_id"),
	approvedAt: timestamp("approved_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("activity_log_placement_idx").using("btree", table.placementId.asc().nullsLast(), table.startedAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.approvedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "activity_log_approved_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [caseFileInCare.id],
			name: "activity_log_case_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.placementId],
			foreignColumns: [placementInPracticum.id],
			name: "activity_log_placement_id_fkey"
		}).onDelete("restrict"),
	check("activity_approval_evidence", sql`((approval_status)::text <> 'approved'::text) OR ((approved_by_account_id IS NOT NULL) AND (approved_at IS NOT NULL))`),
	check("activity_log_approval_status_check", sql`(approval_status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])`),
	check("activity_log_check", sql`ended_at > started_at`),
	check("activity_log_check1", sql`(approved_at IS NULL) OR (approved_by_account_id IS NOT NULL)`),
]);

export const agreementInProjects = projects.table("agreement", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	institutionId: uuid("institution_id").notNull(),
	agreementCode: varchar("agreement_code", { length: 65 }),
	title: varchar({ length: 230 }).notNull(),
	startsOn: date("starts_on"),
	endsOn: date("ends_on"),
	agreementStatus: varchar("agreement_status", { length: 18 }).default('draft').notNull(),
	responsibleAccountId: uuid("responsible_account_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("agreement_code_uq").using("btree", table.agreementCode.asc().nullsLast()).where(sql`(agreement_code IS NOT NULL)`),
	foreignKey({
			columns: [table.institutionId],
			foreignColumns: [institutionInCore.id],
			name: "agreement_institution_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.responsibleAccountId],
			foreignColumns: [accountInIam.id],
			name: "agreement_responsible_account_id_fkey"
		}).onDelete("restrict"),
	check("agreement_agreement_status_check", sql`(agreement_status)::text = ANY ((ARRAY['draft'::character varying, 'active'::character varying, 'expired'::character varying, 'closed'::character varying])::text[])`),
	check("agreement_check", sql`(ends_on IS NULL) OR (starts_on IS NULL) OR (ends_on >= starts_on)`),
]);

export const projectInProjects = projects.table("project", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectCode: varchar("project_code", { length: 60 }),
	name: varchar({ length: 200 }).notNull(),
	projectKind: varchar("project_kind", { length: 25 }).notNull(),
	projectStatus: varchar("project_status", { length: 20 }).default('planned').notNull(),
	responsibleAccountId: uuid("responsible_account_id"),
	startsOn: date("starts_on"),
	endsOn: date("ends_on"),
	summary: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.responsibleAccountId],
			foreignColumns: [accountInIam.id],
			name: "project_responsible_account_id_fkey"
		}).onDelete("restrict"),
	unique("project_project_code_key").on(table.projectCode),
	check("project_check", sql`(ends_on IS NULL) OR (starts_on IS NULL) OR (ends_on >= starts_on)`),
	check("project_project_kind_check", sql`(project_kind)::text = ANY ((ARRAY['campaign'::character varying, 'research'::character varying, 'workshop'::character varying, 'program'::character varying, 'outreach'::character varying, 'other'::character varying])::text[])`),
	check("project_project_status_check", sql`(project_status)::text = ANY ((ARRAY['planned'::character varying, 'active'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[])`),
]);

export const projectInstitutionInProjects = projects.table("project_institution", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectId: uuid("project_id").notNull(),
	institutionId: uuid("institution_id").notNull(),
	involvement: varchar({ length: 25 }).default('participant').notNull(),
}, (table) => [
	foreignKey({
			columns: [table.institutionId],
			foreignColumns: [institutionInCore.id],
			name: "project_institution_institution_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projectInProjects.id],
			name: "project_institution_project_id_fkey"
		}).onDelete("restrict"),
	unique("project_institution_project_id_institution_id_involvement_key").on(table.institutionId, table.involvement, table.projectId),
	check("project_institution_involvement_check", sql`(involvement)::text = ANY ((ARRAY['organizer'::character varying, 'partner'::character varying, 'beneficiary'::character varying, 'participant'::character varying, 'other'::character varying])::text[])`),
]);

export const activityInProjects = projects.table("activity", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	projectId: uuid("project_id"),
	agreementId: uuid("agreement_id"),
	institutionId: uuid("institution_id"),
	activityKind: varchar("activity_kind", { length: 35 }).notNull(),
	title: varchar({ length: 220 }).notNull(),
	startsAt: timestamp("starts_at", { withTimezone: true, mode: 'string' }).notNull(),
	endsAt: timestamp("ends_at", { withTimezone: true, mode: 'string' }),
	venue: varchar({ length: 160 }),
	activityStatus: varchar("activity_status", { length: 18 }).default('planned').notNull(),
	reportedParticipants: integer("reported_participants"),
	summary: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("project_activity_period_idx").using("btree", table.startsAt.desc().nullsFirst(), table.activityKind.asc().nullsLast()),
	foreignKey({
			columns: [table.agreementId],
			foreignColumns: [agreementInProjects.id],
			name: "activity_agreement_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.institutionId],
			foreignColumns: [institutionInCore.id],
			name: "activity_institution_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projectInProjects.id],
			name: "activity_project_id_fkey"
		}).onDelete("restrict"),
	check("activity_activity_kind_check", sql`(activity_kind)::text = ANY ((ARRAY['workshop'::character varying, 'campaign'::character varying, 'research'::character varying, 'meeting'::character varying, 'training'::character varying, 'other'::character varying])::text[])`),
	check("activity_activity_status_check", sql`(activity_status)::text = ANY ((ARRAY['planned'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[])`),
	check("activity_check", sql`(ends_at IS NULL) OR (ends_at > starts_at)`),
	check("activity_reported_participants_check", sql`(reported_participants IS NULL) OR (reported_participants >= 0)`),
]);

export const activityParticipantInProjects = projects.table("activity_participant", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	activityId: uuid("activity_id").notNull(),
	personId: uuid("person_id").notNull(),
	attendanceStatus: varchar("attendance_status", { length: 15 }).default('registered').notNull(),
	participantRole: varchar("participant_role", { length: 30 }).default('attendee').notNull(),
}, (table) => [
	foreignKey({
			columns: [table.activityId],
			foreignColumns: [activityInProjects.id],
			name: "activity_participant_activity_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.personId],
			foreignColumns: [personInCore.id],
			name: "activity_participant_person_id_fkey"
		}).onDelete("restrict"),
	unique("activity_participant_activity_id_person_id_key").on(table.activityId, table.personId),
	check("activity_participant_attendance_status_check", sql`(attendance_status)::text = ANY ((ARRAY['registered'::character varying, 'attended'::character varying, 'absent'::character varying])::text[])`),
]);

export const serviceFeedbackInQuality = quality.table("service_feedback", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	sessionId: uuid("session_id"),
	recordedAt: timestamp("recorded_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	rating: smallint(),
	comments: text(),
	collectionMethod: varchar("collection_method", { length: 25 }).default('web').notNull(),
	enteredByAccountId: uuid("entered_by_account_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("feedback_case_idx").using("btree", table.caseId.asc().nullsLast(), table.recordedAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [caseFileInCare.id],
			name: "service_feedback_case_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.enteredByAccountId],
			foreignColumns: [accountInIam.id],
			name: "service_feedback_entered_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.sessionId, table.caseId],
			foreignColumns: [sessionRecordInCare.id, sessionRecordInCare.caseId],
			name: "service_feedback_session_id_case_id_fkey"
		}).onDelete("restrict"),
	check("service_feedback_check", sql`(rating IS NOT NULL) OR (comments IS NOT NULL)`),
	check("service_feedback_collection_method_check", sql`(collection_method)::text = ANY ((ARRAY['web'::character varying, 'in_person'::character varying, 'external_form'::character varying, 'other'::character varying])::text[])`),
	check("service_feedback_rating_check", sql`(rating >= 1) AND (rating <= 5)`),
]);

export const caseInterruptionInQuality = quality.table("case_interruption", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	caseId: uuid("case_id").notNull(),
	reasonCategory: varchar("reason_category", { length: 80 }),
	declaredReason: text("declared_reason"),
	declaredAt: timestamp("declared_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	recordedByAccountId: uuid("recorded_by_account_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [caseFileInCare.id],
			name: "case_interruption_case_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.recordedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "case_interruption_recorded_by_account_id_fkey"
		}).onDelete("restrict"),
]);

export const documentTypeInArchive = archive.table("document_type", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: varchar({ length: 50 }).notNull(),
	label: varchar({ length: 120 }).notNull(),
	active: boolean().default(true).notNull(),
}, (table) => [
	unique("document_type_code_key").on(table.code),
]);

export const documentInArchive = archive.table("document", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentTypeId: uuid("document_type_id").notNull(),
	title: varchar({ length: 230 }).notNull(),
	confidentiality: varchar({ length: 20 }).default('restricted').notNull(),
	originalSource: varchar("original_source", { length: 22 }).default('digital').notNull(),
	createdByAccountId: uuid("created_by_account_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.createdByAccountId],
			foreignColumns: [accountInIam.id],
			name: "document_created_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.documentTypeId],
			foreignColumns: [documentTypeInArchive.id],
			name: "document_document_type_id_fkey"
		}).onDelete("restrict"),
	check("document_confidentiality_check", sql`(confidentiality)::text = ANY ((ARRAY['internal'::character varying, 'restricted'::character varying, 'highly_restricted'::character varying])::text[])`),
	check("document_original_source_check", sql`(original_source)::text = ANY ((ARRAY['digital'::character varying, 'scanned'::character varying, 'external'::character varying])::text[])`),
]);

export const documentLinkInArchive = archive.table("document_link", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid("document_id").notNull(),
	caseId: uuid("case_id"),
	sessionId: uuid("session_id"),
	evaluationId: uuid("evaluation_id"),
	placementId: uuid("placement_id"),
	projectId: uuid("project_id"),
	projectActivityId: uuid("project_activity_id"),
	agreementId: uuid("agreement_id"),
	consentId: uuid("consent_id"),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'string' }),
	revokedByAccountId: uuid("revoked_by_account_id"),
	linkedByAccountId: uuid("linked_by_account_id").notNull(),
	linkedAt: timestamp("linked_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("document_link_activity_idx").using("btree", table.projectActivityId.asc().nullsLast()).where(sql`(project_activity_id IS NOT NULL)`),
	index("document_link_agreement_idx").using("btree", table.agreementId.asc().nullsLast()).where(sql`(agreement_id IS NOT NULL)`),
	index("document_link_case_idx").using("btree", table.caseId.asc().nullsLast()).where(sql`(case_id IS NOT NULL)`),
	uniqueIndex("document_link_case_uq").using("btree", table.documentId.asc().nullsLast(), table.caseId.asc().nullsLast()).where(sql`((case_id IS NOT NULL) AND (revoked_at IS NULL))`),
	index("document_link_consent_idx").using("btree", table.consentId.asc().nullsLast()).where(sql`(consent_id IS NOT NULL)`),
	index("document_link_evaluation_idx").using("btree", table.evaluationId.asc().nullsLast()).where(sql`(evaluation_id IS NOT NULL)`),
	uniqueIndex("document_link_evaluation_uq").using("btree", table.documentId.asc().nullsLast(), table.evaluationId.asc().nullsLast()).where(sql`((evaluation_id IS NOT NULL) AND (revoked_at IS NULL))`),
	index("document_link_placement_idx").using("btree", table.placementId.asc().nullsLast()).where(sql`(placement_id IS NOT NULL)`),
	index("document_link_project_idx").using("btree", table.projectId.asc().nullsLast()).where(sql`(project_id IS NOT NULL)`),
	index("document_link_session_idx").using("btree", table.sessionId.asc().nullsLast()).where(sql`(session_id IS NOT NULL)`),
	uniqueIndex("document_link_session_uq").using("btree", table.documentId.asc().nullsLast(), table.sessionId.asc().nullsLast()).where(sql`((session_id IS NOT NULL) AND (revoked_at IS NULL))`),
	foreignKey({
			columns: [table.agreementId],
			foreignColumns: [agreementInProjects.id],
			name: "document_link_agreement_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.caseId],
			foreignColumns: [caseFileInCare.id],
			name: "document_link_case_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.consentId],
			foreignColumns: [consentRecordInCare.id],
			name: "document_link_consent_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [documentInArchive.id],
			name: "document_link_document_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.evaluationId],
			foreignColumns: [evaluationProcessInEvaluation.id],
			name: "document_link_evaluation_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.linkedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "document_link_linked_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.placementId],
			foreignColumns: [placementInPracticum.id],
			name: "document_link_placement_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.projectActivityId],
			foreignColumns: [activityInProjects.id],
			name: "document_link_project_activity_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projectInProjects.id],
			name: "document_link_project_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.revokedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "document_link_revoked_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [sessionRecordInCare.id],
			name: "document_link_session_id_fkey"
		}).onDelete("restrict"),
	check("document_link_check", sql`num_nonnulls(case_id, session_id, evaluation_id, placement_id, project_id, project_activity_id, agreement_id, consent_id) = 1`),
	check("document_link_check1", sql`(revoked_at IS NULL) OR ((revoked_by_account_id IS NOT NULL) AND (revoked_at >= linked_at))`),
]);

export const reportExecutionInReporting = reporting.table("report_execution", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	reportCode: varchar("report_code", { length: 90 }).notNull(),
	requestedByAccountId: uuid("requested_by_account_id").notNull(),
	reportFormat: varchar("report_format", { length: 15 }).notNull(),
	filtersJson: jsonb("filters_json").default({}).notNull(),
	generatedAt: timestamp("generated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	outcome: varchar({ length: 18 }).default('success').notNull(),
	rowCount: integer("row_count"),
}, (table) => [
	index("report_execution_user_date_idx").using("btree", table.requestedByAccountId.asc().nullsLast(), table.generatedAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.requestedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "report_execution_requested_by_account_id_fkey"
		}).onDelete("restrict"),
	check("report_execution_filters_json_check", sql`jsonb_typeof(filters_json) = 'object'::text`),
	check("report_execution_outcome_check", sql`(outcome)::text = ANY ((ARRAY['success'::character varying, 'failure'::character varying])::text[])`),
	check("report_execution_report_format_check", sql`(report_format)::text = ANY ((ARRAY['dashboard'::character varying, 'pdf'::character varying, 'xlsx'::character varying, 'csv'::character varying])::text[])`),
	check("report_execution_row_count_check", sql`(row_count IS NULL) OR (row_count >= 0)`),
]);

export const institutionInCore = core.table("institution", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 200 }).notNull(),
	kind: varchar({ length: 24 }).notNull(),
	parentInstitutionId: uuid("parent_institution_id"),
	externalCode: varchar("external_code", { length: 60 }),
	contactEmail: varchar("contact_email", { length: 254 }),
	active: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("institution_external_code_uq").using("btree", table.externalCode.asc().nullsLast()).where(sql`(external_code IS NOT NULL)`),
	index("institution_parent_idx").using("btree", table.parentInstitutionId.asc().nullsLast()),
	foreignKey({
			columns: [table.parentInstitutionId],
			foreignColumns: [table.id],
			name: "institution_parent_institution_id_fkey"
		}).onDelete("restrict"),
	check("institution_kind_check", sql`(kind)::text = ANY ((ARRAY['university'::character varying, 'ucb_unit'::character varying, 'company'::character varying, 'school'::character varying, 'ngo'::character varying, 'public'::character varying, 'other'::character varying])::text[])`),
	check("institution_not_self", sql`(parent_institution_id IS NULL) OR (id <> parent_institution_id)`),
]);

export const academicProgramInCore = core.table("academic_program", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	institutionId: uuid("institution_id").notNull(),
	name: varchar({ length: 150 }).notNull(),
	code: varchar({ length: 40 }),
	active: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.institutionId],
			foreignColumns: [institutionInCore.id],
			name: "academic_program_institution_id_fkey"
		}).onDelete("restrict"),
	unique("academic_program_institution_id_name_key").on(table.institutionId, table.name),
	unique("academic_program_id_institution_id_key").on(table.id, table.institutionId),
]);

export const emergencyContactInCore = core.table("emergency_contact", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	personId: uuid("person_id").notNull(),
	contactName: varchar("contact_name", { length: 200 }).notNull(),
	relationship: varchar({ length: 80 }),
	contactPhone: varchar("contact_phone", { length: 50 }).notNull(),
	contactEmail: varchar("contact_email", { length: 254 }),
	isPrimary: boolean("is_primary").default(false).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	contactAuthorized: boolean("contact_authorized").default(false).notNull(),
	authorizationRecordedAt: timestamp("authorization_recorded_at", { withTimezone: true, mode: 'string' }),
	verifiedAt: timestamp("verified_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("emergency_contact_person_idx").using("btree", table.personId.asc().nullsLast()),
	uniqueIndex("emergency_one_active_primary_uq").using("btree", table.personId.asc().nullsLast()).where(sql`(is_primary AND is_active)`),
	foreignKey({
			columns: [table.personId],
			foreignColumns: [personInCore.id],
			name: "emergency_contact_person_id_fkey"
		}).onDelete("restrict"),
	check("contact_authorization_consistent", sql`(NOT contact_authorized) OR (authorization_recorded_at IS NOT NULL)`),
	check("contact_name_nonempty", sql`length(TRIM(BOTH FROM contact_name)) > 0`),
	check("contact_phone_nonempty", sql`length(TRIM(BOTH FROM contact_phone)) > 0`),
]);

export const personAffiliationInCore = core.table("person_affiliation", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	personId: uuid("person_id").notNull(),
	institutionId: uuid("institution_id"),
	academicProgramId: uuid("academic_program_id"),
	affiliationKind: varchar("affiliation_kind", { length: 35 }).notNull(),
	studentSemester: smallint("student_semester"),
	startedOn: date("started_on"),
	endedOn: date("ended_on"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("affiliation_person_idx").using("btree", table.personId.asc().nullsLast()),
	index("affiliation_program_idx").using("btree", table.academicProgramId.asc().nullsLast()),
	foreignKey({
			columns: [table.academicProgramId, table.institutionId],
			foreignColumns: [academicProgramInCore.id, academicProgramInCore.institutionId],
			name: "affiliation_program_same_institution"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.academicProgramId],
			foreignColumns: [academicProgramInCore.id],
			name: "person_affiliation_academic_program_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.institutionId],
			foreignColumns: [institutionInCore.id],
			name: "person_affiliation_institution_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.personId],
			foreignColumns: [personInCore.id],
			name: "person_affiliation_person_id_fkey"
		}).onDelete("restrict"),
	check("person_affiliation_affiliation_kind_check", sql`(affiliation_kind)::text = ANY ((ARRAY['student'::character varying, 'teacher'::character varying, 'staff'::character varying, 'alumni'::character varying, 'older_adult'::character varying, 'external'::character varying, 'intern'::character varying, 'other'::character varying])::text[])`),
	check("person_affiliation_check", sql`(ended_on IS NULL) OR (started_on IS NULL) OR (ended_on >= started_on)`),
	check("person_affiliation_check1", sql`(academic_program_id IS NULL) OR (institution_id IS NOT NULL)`),
	check("person_affiliation_student_semester_check", sql`(student_semester >= 1) AND (student_semester <= 20)`),
]);

export const personInCore = core.table("person", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	givenNames: varchar("given_names", { length: 160 }).notNull(),
	familyNames: varchar("family_names", { length: 160 }).notNull(),
	birthDate: date("birth_date"),
	sexRecorded: varchar("sex_recorded", { length: 30 }),
	identityDocType: varchar("identity_doc_type", { length: 30 }),
	identityDocNumber: varchar("identity_doc_number", { length: 60 }),
	contactEmail: varchar("contact_email", { length: 254 }),
	contactPhone: varchar("contact_phone", { length: 50 }),
	active: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdByAccountId: uuid("created_by_account_id"),
	createdBySystem: varchar("created_by_system", { length: 100 }),
	updatedByAccountId: uuid("updated_by_account_id"),
	updatedBySystem: varchar("updated_by_system", { length: 100 }),
}, (table): PgTableExtraConfigValue[] => [
	uniqueIndex("person_identity_document_uq").using("btree", table.identityDocType.asc().nullsLast(), table.identityDocNumber.asc().nullsLast()).where(sql`(identity_doc_number IS NOT NULL)`),
	index("person_name_idx").using("btree", table.familyNames.asc().nullsLast(), table.givenNames.asc().nullsLast()),
	foreignKey({
			columns: [table.createdByAccountId],
			foreignColumns: [accountInIam.id],
			name: "person_created_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.updatedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "person_updated_by_account_id_fkey"
		}).onDelete("restrict"),
	check("author_origin_required", sql`num_nonnulls(created_by_account_id, created_by_system) = 1`),
	check("doc_number_requires_type", sql`(identity_doc_number IS NULL) OR (identity_doc_type IS NOT NULL)`),
	check("person_birth_date_not_future", sql`(birth_date IS NULL) OR (birth_date <= CURRENT_DATE)`),
	check("person_names_nonempty", sql`(length(btrim((given_names)::text)) > 0) AND (length(btrim((family_names)::text)) > 0)`),
	check("person_sex_catalog", sql`(sex_recorded IS NULL) OR ((sex_recorded)::text = ANY ((ARRAY['female'::character varying, 'male'::character varying, 'intersex'::character varying, 'other'::character varying, 'not_disclosed'::character varying])::text[]))`),
]);

export const roomInAgenda = agenda.table("room", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 120 }).notNull(),
	kind: varchar({ length: 30 }).default('consultation').notNull(),
	capacity: smallint(),
	active: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("room_name_key").on(table.name),
	check("room_capacity_check", sql`(capacity IS NULL) OR (capacity > 0)`),
	check("room_kind_check", sql`(kind)::text = ANY ((ARRAY['consultation'::character varying, 'evaluation'::character varying, 'gesell'::character varying, 'laboratory'::character varying, 'meeting'::character varying, 'other'::character varying])::text[])`),
]);

export const appointmentHistoryInAgenda = agenda.table("appointment_history", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	appointmentId: uuid("appointment_id").notNull(),
	previousStartsAt: timestamp("previous_starts_at", { withTimezone: true, mode: 'string' }).notNull(),
	previousEndsAt: timestamp("previous_ends_at", { withTimezone: true, mode: 'string' }).notNull(),
	newStartsAt: timestamp("new_starts_at", { withTimezone: true, mode: 'string' }).notNull(),
	newEndsAt: timestamp("new_ends_at", { withTimezone: true, mode: 'string' }).notNull(),
	previousRoomId: uuid("previous_room_id"),
	newRoomId: uuid("new_room_id"),
	previousProfessionalAccountId: uuid("previous_professional_account_id"),
	newProfessionalAccountId: uuid("new_professional_account_id"),
	previousStatus: varchar("previous_status", { length: 20 }).notNull(),
	newStatus: varchar("new_status", { length: 20 }).notNull(),
	reason: text(),
	changedByAccountId: uuid("changed_by_account_id").notNull(),
	changedAt: timestamp("changed_at", { withTimezone: true, mode: 'string' }).default(sql`clock_timestamp()`).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	eventNo: bigint("event_no", { mode: "number" }).generatedAlwaysAsIdentity({ name: "agenda.appointment_history_event_no_seq", startWith: 1, increment: 1, minValue: 1, maxValue: "9223372036854775807", cache: 1 }),
}, (table) => [
	index("appointment_history_idx").using("btree", table.appointmentId.asc().nullsLast(), table.changedAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.appointmentId],
			foreignColumns: [appointmentInAgenda.id],
			name: "appointment_history_appointment_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.changedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "appointment_history_changed_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.newProfessionalAccountId],
			foreignColumns: [accountInIam.id],
			name: "appointment_history_new_professional_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.newRoomId],
			foreignColumns: [roomInAgenda.id],
			name: "appointment_history_new_room_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.previousProfessionalAccountId],
			foreignColumns: [accountInIam.id],
			name: "appointment_history_previous_professional_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.previousRoomId],
			foreignColumns: [roomInAgenda.id],
			name: "appointment_history_previous_room_id_fkey"
		}).onDelete("restrict"),
	unique("appointment_history_event_no_key").on(table.eventNo),
]);

export const instrumentInEvaluation = evaluation.table("instrument", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: varchar({ length: 60 }).notNull(),
	name: varchar({ length: 180 }).notNull(),
	modality: varchar({ length: 20 }).default('manual').notNull(),
	requiresLicense: boolean("requires_license").default(false).notNull(),
	active: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("instrument_code_key").on(table.code),
	check("instrument_modality_check", sql`(modality)::text = ANY ((ARRAY['manual'::character varying, 'digital'::character varying, 'mixed'::character varying])::text[])`),
]);

export const instrumentLoanInEvaluation = evaluation.table("instrument_loan", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	instrumentId: uuid("instrument_id").notNull(),
	borrowerPersonId: uuid("borrower_person_id").notNull(),
	componentsDescription: text("components_description").notNull(),
	conditionAtCheckout: text("condition_at_checkout"),
	checkedOutAt: timestamp("checked_out_at", { withTimezone: true, mode: 'string' }),
	dueAt: timestamp("due_at", { withTimezone: true, mode: 'string' }),
	returnedAt: timestamp("returned_at", { withTimezone: true, mode: 'string' }),
	conditionAtReturn: text("condition_at_return"),
	loanStatus: varchar("loan_status", { length: 18 }).default('requested').notNull(),
	checkedOutByAccountId: uuid("checked_out_by_account_id"),
	receivedByAccountId: uuid("received_by_account_id"),
	createdByAccountId: uuid("created_by_account_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("loan_borrower_time_idx").using("btree", table.borrowerPersonId.asc().nullsLast(), table.createdAt.desc().nullsFirst()),
	index("loan_instrument_status_idx").using("btree", table.instrumentId.asc().nullsLast(), table.loanStatus.asc().nullsLast()),
	foreignKey({
			columns: [table.borrowerPersonId],
			foreignColumns: [personInCore.id],
			name: "instrument_loan_borrower_person_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.checkedOutByAccountId],
			foreignColumns: [accountInIam.id],
			name: "instrument_loan_checked_out_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.createdByAccountId],
			foreignColumns: [accountInIam.id],
			name: "instrument_loan_created_by_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.instrumentId],
			foreignColumns: [instrumentInEvaluation.id],
			name: "instrument_loan_instrument_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.receivedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "instrument_loan_received_by_account_id_fkey"
		}).onDelete("restrict"),
	check("instrument_loan_check", sql`(due_at IS NULL) OR (checked_out_at IS NULL) OR (due_at >= checked_out_at)`),
	check("instrument_loan_check1", sql`(returned_at IS NULL) OR (checked_out_at IS NULL) OR (returned_at >= checked_out_at)`),
	check("instrument_loan_check2", sql`((loan_status)::text <> 'returned'::text) OR ((returned_at IS NOT NULL) AND (checked_out_at IS NOT NULL))`),
	check("instrument_loan_check3", sql`(returned_at IS NULL) OR ((loan_status)::text = 'returned'::text)`),
	check("instrument_loan_check4", sql`((loan_status)::text <> 'checked_out'::text) OR ((checked_out_at IS NOT NULL) AND (checked_out_by_account_id IS NOT NULL))`),
	check("instrument_loan_check5", sql`((loan_status)::text <> 'returned'::text) OR (received_by_account_id IS NOT NULL)`),
	check("instrument_loan_components_description_check", sql`length(TRIM(BOTH FROM components_description)) > 0`),
	check("instrument_loan_loan_status_check", sql`(loan_status)::text = ANY ((ARRAY['requested'::character varying, 'approved'::character varying, 'checked_out'::character varying, 'returned'::character varying, 'cancelled'::character varying])::text[])`),
]);

export const documentVersionInArchive = archive.table("document_version", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid("document_id").notNull(),
	versionNumber: integer("version_number").notNull(),
	provider: varchar({ length: 30 }).default('s3_compatible').notNull(),
	bucketName: varchar("bucket_name", { length: 120 }).notNull(),
	objectKey: text("object_key").notNull(),
	storageVersionId: varchar("storage_version_id", { length: 240 }),
	originalFilename: varchar("original_filename", { length: 250 }).notNull(),
	contentType: varchar("content_type", { length: 130 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	contentLengthBytes: bigint("content_length_bytes", { mode: "number" }).notNull(),
	sha256Hex: char("sha256_hex", { length: 64 }).notNull(),
	uploadedByAccountId: uuid("uploaded_by_account_id").notNull(),
	uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("document_version_lookup_idx").using("btree", table.documentId.asc().nullsLast(), table.versionNumber.desc().nullsFirst().op("int4_ops")),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [documentInArchive.id],
			name: "document_version_document_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.uploadedByAccountId],
			foreignColumns: [accountInIam.id],
			name: "document_version_uploaded_by_account_id_fkey"
		}).onDelete("restrict"),
	unique("document_version_document_id_version_number_key").on(table.documentId, table.versionNumber),
	unique("document_version_provider_bucket_name_object_key_key").on(table.bucketName, table.objectKey, table.provider),
	check("document_version_content_length_bytes_check", sql`content_length_bytes >= 0`),
	check("document_version_sha256_hex_check", sql`sha256_hex ~ '^[0-9a-fA-F]{64}$'::text`),
	check("document_version_version_number_check", sql`version_number > 0`),
]);

export const changeEventInAudit = audit.table("change_event", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "audit.change_event_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: "9223372036854775807", cache: 1 }),
	schemaName: text("schema_name").notNull(),
	tableName: text("table_name").notNull(),
	rowId: uuid("row_id").notNull(),
	operation: varchar({ length: 6 }).notNull(),
	changedColumnNames: text("changed_column_names").array().default(["RAY"]).notNull(),
	actorAccountId: uuid("actor_account_id"),
	dbLoginName: text("db_login_name").notNull(),
	requestId: uuid("request_id").notNull(),
	occurredAt: timestamp("occurred_at", { withTimezone: true, mode: 'string' }).default(sql`clock_timestamp()`).notNull(),
	actorKind: varchar("actor_kind", { length: 10 }).notNull(),
	authSessionId: uuid("auth_session_id"),
	systemActor: varchar("system_actor", { length: 100 }),
}, (table) => [
	index("audit_change_actor_idx").using("btree", table.actorAccountId.asc().nullsLast(), table.occurredAt.desc().nullsFirst()),
	index("audit_change_request_idx").using("btree", table.requestId.asc().nullsLast()),
	index("audit_change_session_idx").using("btree", table.authSessionId.asc().nullsLast(), table.occurredAt.desc().nullsFirst()).where(sql`(auth_session_id IS NOT NULL)`),
	index("audit_change_target_idx").using("btree", table.schemaName.asc().nullsLast(), table.tableName.asc().nullsLast(), table.rowId.asc().nullsLast(), table.occurredAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.actorAccountId],
			foreignColumns: [accountInIam.id],
			name: "change_event_actor_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.authSessionId, table.actorAccountId],
			foreignColumns: [authSessionInIam.id, authSessionInIam.accountId],
			name: "change_session_owner"
		}).onDelete("restrict"),
	check("change_actor_context", sql`(((actor_kind)::text = 'human'::text) AND (actor_account_id IS NOT NULL) AND (auth_session_id IS NOT NULL) AND (system_actor IS NULL)) OR (((actor_kind)::text = 'system'::text) AND (actor_account_id IS NULL) AND (auth_session_id IS NULL) AND (length(btrim((system_actor)::text)) > 0) AND (system_actor IS NOT NULL))`),
	check("change_event_actor_kind_check", sql`(actor_kind)::text = ANY ((ARRAY['human'::character varying, 'system'::character varying])::text[])`),
	check("change_event_operation_check", sql`(operation)::text = ANY ((ARRAY['INSERT'::character varying, 'UPDATE'::character varying, 'DELETE'::character varying])::text[])`),
]);

export const accessEventInAudit = audit.table("access_event", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "audit.access_event_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: "9223372036854775807", cache: 1 }),
	actorAccountId: uuid("actor_account_id").notNull(),
	action: varchar({ length: 25 }).notNull(),
	targetKind: varchar("target_kind", { length: 45 }).notNull(),
	targetId: uuid("target_id"),
	requestId: uuid("request_id").notNull(),
	purpose: varchar({ length: 140 }),
	succeeded: boolean().default(true).notNull(),
	occurredAt: timestamp("occurred_at", { withTimezone: true, mode: 'string' }).default(sql`clock_timestamp()`).notNull(),
	authSessionId: uuid("auth_session_id").notNull(),
}, (table) => [
	index("access_actor_time_idx").using("btree", table.actorAccountId.asc().nullsLast(), table.occurredAt.desc().nullsFirst()),
	index("access_target_time_idx").using("btree", table.targetKind.asc().nullsLast(), table.targetId.asc().nullsLast(), table.occurredAt.desc().nullsFirst()),
	index("audit_access_request_idx").using("btree", table.requestId.asc().nullsLast()),
	index("audit_access_session_idx").using("btree", table.authSessionId.asc().nullsLast(), table.occurredAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.actorAccountId],
			foreignColumns: [accountInIam.id],
			name: "access_event_actor_account_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.authSessionId, table.actorAccountId],
			foreignColumns: [authSessionInIam.id, authSessionInIam.accountId],
			name: "access_session_owner"
		}).onDelete("restrict"),
	check("access_event_action_check", sql`(action)::text = ANY ((ARRAY['view_person'::character varying, 'view_case'::character varying, 'view_evaluation'::character varying, 'download_document'::character varying, 'upload_document'::character varying, 'export_report'::character varying, 'access_denied'::character varying])::text[])`),
]);
export const vEffectivePermissionInIam = iam.view("v_effective_permission", {	accountId: uuid("account_id"),
	permissionCode: varchar("permission_code", { length: 100 }),
}).as(sql`SELECT DISTINCT ar.account_id, p.code AS permission_code FROM iam.account_role ar JOIN iam.account a ON a.id = ar.account_id JOIN iam.role r ON r.id = ar.role_id JOIN iam.role_permission rp ON rp.role_id = r.id JOIN iam.permission p ON p.id = rp.permission_id WHERE a.account_status::text = 'active'::text AND r.active AND p.active AND ar.revoked_at IS NULL AND rp.revoked_at IS NULL`);

export const vCaseSessionTotalsInReporting = reporting.view("v_case_session_totals", {	caseId: uuid("case_id"),
	caseNumber: varchar("case_number", { length: 45 }),
	personId: uuid("person_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	completedSessions: bigint("completed_sessions", { mode: "number" }),
	lastCompletedSessionAt: timestamp("last_completed_session_at", { withTimezone: true, mode: 'string' }),
}).as(sql`SELECT c.id AS case_id, c.case_number, c.person_id, count(s.id) FILTER (WHERE s.session_status::text = 'completed'::text) AS completed_sessions, max(s.started_at) FILTER (WHERE s.session_status::text = 'completed'::text) AS last_completed_session_at FROM care.case_file c LEFT JOIN care.session_record s ON s.case_id = c.id GROUP BY c.id, c.case_number, c.person_id`);

export const vMonthlySessionsInReporting = reporting.view("v_monthly_sessions", {	monthLocal: date("month_local"),
	professionalAccountId: uuid("professional_account_id"),
	serviceTypeId: uuid("service_type_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	completedSessions: bigint("completed_sessions", { mode: "number" }),
}).as(sql`SELECT date_trunc('month'::text, (s.started_at AT TIME ZONE 'America/La_Paz'::text))::date AS month_local, s.professional_account_id, c.service_type_id, count(*) AS completed_sessions FROM care.session_record s JOIN care.case_file c ON c.id = s.case_id WHERE s.session_status::text = 'completed'::text GROUP BY (date_trunc('month'::text, (s.started_at AT TIME ZONE 'America/La_Paz'::text))::date), s.professional_account_id, c.service_type_id`);

export const vPracticumApprovedHoursInReporting = reporting.view("v_practicum_approved_hours", {	placementId: uuid("placement_id"),
	studentPersonId: uuid("student_person_id"),
	approvedHours: numeric("approved_hours", { precision: 12, scale:  2 }),
}).as(sql`SELECT p.id AS placement_id, p.student_person_id, COALESCE(sum(EXTRACT(epoch FROM a.ended_at - a.started_at) / 3600.0) FILTER (WHERE a.approval_status::text = 'approved'::text), 0::numeric)::numeric(12,2) AS approved_hours FROM practicum.placement p LEFT JOIN practicum.activity_log a ON a.placement_id = p.id GROUP BY p.id, p.student_person_id`);

export const accountActionTokenInIam = iam.table('account_action_token', {
  id: uuid().defaultRandom().primaryKey().notNull(), accountId: uuid('account_id').notNull(),
  purpose: varchar({ length: 30 }).notNull(), tokenHash: bytea('token_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).default(sql`clock_timestamp()`).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'string' }),
  consumedBySessionId: uuid('consumed_by_session_id'), revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
}, (table) => [
  foreignKey({ columns: [table.accountId], foreignColumns: [accountInIam.id], name: 'account_action_token_account_id_fkey' }).onDelete('restrict'),
  foreignKey({ columns: [table.consumedBySessionId, table.accountId], foreignColumns: [authSessionInIam.id,authSessionInIam.accountId], name: 'action_consumption_session' }).onDelete('restrict'),
  unique('account_action_token_token_hash_key').on(table.tokenHash),
  uniqueIndex('pending_account_action_uq').on(table.accountId,table.purpose).where(sql`consumed_at IS NULL AND revoked_at IS NULL`),
  index('account_action_account_idx').on(table.accountId,table.createdAt.desc()),
  check('account_action_token_purpose_check',sql`purpose IN ('director_activation','operational_activation','password_reset')`),
  check('account_action_token_token_hash_check',sql`octet_length(token_hash)=32`),
  check('action_expiration',sql`expires_at>created_at`),
  check('action_consumption',sql`(consumed_at IS NULL)=(consumed_by_session_id IS NULL) AND (consumed_at IS NULL OR consumed_at>=created_at)`),
  check('action_revocation',sql`revoked_at IS NULL OR (revoked_at>=created_at AND consumed_at IS NULL)`),
]);
