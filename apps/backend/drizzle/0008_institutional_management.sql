CREATE TABLE "projects"."institutional_team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid,
	"agreement_id" uuid,
	"project_id" uuid,
	"account_id" uuid NOT NULL,
	"removed_at" timestamp with time zone,
	"created_by_account_id" uuid,
	"updated_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutional_team_one_target" CHECK (num_nonnulls(activity_id,agreement_id,project_id)=1)
);
--> statement-breakpoint
CREATE TABLE "iam"."user_notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_account_id" uuid NOT NULL,
	"sender_account_id" uuid NOT NULL,
	"event_key" uuid NOT NULL,
	"event_type" varchar(40) NOT NULL,
	"resource_kind" varchar(20) NOT NULL,
	"resource_id" uuid NOT NULL,
	"resource_type" varchar(35) NOT NULL,
	"resource_title" varchar(230) NOT NULL,
	"actor_name" varchar(250) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "user_notification_event_key_unique" UNIQUE("event_key"),
	CONSTRAINT "notification_event_type_check" CHECK (event_type='institutional_assignment'),
	CONSTRAINT "notification_resource_kind_check" CHECK (resource_kind IN ('activity','agreement','project'))
);
--> statement-breakpoint
ALTER TABLE "projects"."activity" DROP CONSTRAINT "activity_activity_kind_check";--> statement-breakpoint
ALTER TABLE "projects"."activity" ADD COLUMN "version_no" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects"."activity" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects"."activity" ADD COLUMN "change_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "projects"."activity" ADD COLUMN "request_fingerprint" varchar(64);--> statement-breakpoint
ALTER TABLE "projects"."activity" ADD COLUMN "created_by_account_id" uuid;--> statement-breakpoint
ALTER TABLE "projects"."activity" ADD COLUMN "updated_by_account_id" uuid;--> statement-breakpoint
ALTER TABLE "projects"."activity" ADD COLUMN "responsible_account_id" uuid;--> statement-breakpoint
ALTER TABLE "projects"."activity" ADD COLUMN "results" text;--> statement-breakpoint
ALTER TABLE "projects"."agreement" ADD COLUMN "version_no" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects"."agreement" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects"."agreement" ADD COLUMN "change_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "projects"."agreement" ADD COLUMN "request_fingerprint" varchar(64);--> statement-breakpoint
ALTER TABLE "projects"."agreement" ADD COLUMN "created_by_account_id" uuid;--> statement-breakpoint
ALTER TABLE "projects"."agreement" ADD COLUMN "updated_by_account_id" uuid;--> statement-breakpoint
ALTER TABLE "projects"."agreement" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "projects"."project" ADD COLUMN "version_no" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects"."project" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects"."project" ADD COLUMN "change_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "projects"."project" ADD COLUMN "request_fingerprint" varchar(64);--> statement-breakpoint
ALTER TABLE "projects"."project" ADD COLUMN "created_by_account_id" uuid;--> statement-breakpoint
ALTER TABLE "projects"."project" ADD COLUMN "updated_by_account_id" uuid;--> statement-breakpoint
ALTER TABLE "projects"."project" ADD COLUMN "institution_id" uuid;--> statement-breakpoint
ALTER TABLE "projects"."institutional_team" ADD CONSTRAINT "institutional_team_activity_id_activity_id_fk" FOREIGN KEY ("activity_id") REFERENCES "projects"."activity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."institutional_team" ADD CONSTRAINT "institutional_team_agreement_id_agreement_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "projects"."agreement"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."institutional_team" ADD CONSTRAINT "institutional_team_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."institutional_team" ADD CONSTRAINT "institutional_team_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "iam"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."institutional_team" ADD CONSTRAINT "institutional_team_created_by_account_id_account_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "iam"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."institutional_team" ADD CONSTRAINT "institutional_team_updated_by_account_id_account_id_fk" FOREIGN KEY ("updated_by_account_id") REFERENCES "iam"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."user_notification" ADD CONSTRAINT "user_notification_recipient_account_id_account_id_fk" FOREIGN KEY ("recipient_account_id") REFERENCES "iam"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."user_notification" ADD CONSTRAINT "user_notification_sender_account_id_account_id_fk" FOREIGN KEY ("sender_account_id") REFERENCES "iam"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "institutional_team_activity_uq" ON "projects"."institutional_team" USING btree ("activity_id","account_id") WHERE activity_id IS NOT NULL AND removed_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "institutional_team_agreement_uq" ON "projects"."institutional_team" USING btree ("agreement_id","account_id") WHERE agreement_id IS NOT NULL AND removed_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "institutional_team_project_uq" ON "projects"."institutional_team" USING btree ("project_id","account_id") WHERE project_id IS NOT NULL AND removed_at IS NULL;--> statement-breakpoint
CREATE INDEX "institutional_team_account_idx" ON "projects"."institutional_team" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "notification_recipient_page_idx" ON "iam"."user_notification" USING btree ("recipient_account_id","created_at","id");--> statement-breakpoint
ALTER TABLE "projects"."activity" ADD CONSTRAINT "activity_created_by_account_id_account_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "iam"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."activity" ADD CONSTRAINT "activity_updated_by_account_id_account_id_fk" FOREIGN KEY ("updated_by_account_id") REFERENCES "iam"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."activity" ADD CONSTRAINT "activity_responsible_account_id_account_id_fk" FOREIGN KEY ("responsible_account_id") REFERENCES "iam"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."agreement" ADD CONSTRAINT "agreement_created_by_account_id_account_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "iam"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."agreement" ADD CONSTRAINT "agreement_updated_by_account_id_account_id_fk" FOREIGN KEY ("updated_by_account_id") REFERENCES "iam"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."project" ADD CONSTRAINT "project_created_by_account_id_account_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "iam"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."project" ADD CONSTRAINT "project_updated_by_account_id_account_id_fk" FOREIGN KEY ("updated_by_account_id") REFERENCES "iam"."account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."project" ADD CONSTRAINT "project_institution_id_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "core"."institution"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."activity" ADD CONSTRAINT "activity_activity_kind_check" CHECK (activity_kind IN ('workshop','talk','campaign','research','meeting','training','other'));
--> statement-breakpoint
CREATE FUNCTION projects.guard_institutional_record() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Archived records are immutable' USING ERRCODE='23514'; END IF;
    IF NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint THEN RAISE EXCEPTION 'Creation identity is immutable' USING ERRCODE='23514'; END IF;
    IF length(btrim(COALESCE(NEW.change_reason,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'A change reason is required' USING ERRCODE='23514'; END IF;
    NEW.version_no:=OLD.version_no+1;
  ELSE NEW.version_no:=1;
  END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['activity','agreement','project'] LOOP
    EXECUTE format('CREATE TRIGGER b10_record_version BEFORE INSERT OR UPDATE ON projects.%I FOR EACH ROW EXECUTE FUNCTION projects.guard_institutional_record()',item);
    EXECUTE format('CREATE TRIGGER prevent_hard_delete BEFORE DELETE ON projects.%I FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation()',item);
    EXECUTE format('CREATE INDEX %I ON projects.%I(created_at DESC,id DESC) WHERE deleted_at IS NULL',item||'_institutional_page_idx',item);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION projects.guard_team_membership() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF ROW(NEW.activity_id,NEW.agreement_id,NEW.project_id,NEW.account_id) IS DISTINCT FROM ROW(OLD.activity_id,OLD.agreement_id,OLD.project_id,OLD.account_id) OR OLD.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Membership identity is immutable; create a new assignment' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER a00_request_authorship BEFORE INSERT OR UPDATE ON projects.institutional_team FOR EACH ROW EXECUTE FUNCTION audit.stamp_authorship();
CREATE TRIGGER b10_team_membership BEFORE UPDATE ON projects.institutional_team FOR EACH ROW EXECUTE FUNCTION projects.guard_team_membership();
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE ON projects.institutional_team FOR EACH ROW EXECUTE FUNCTION audit.record_row_change();
CREATE TRIGGER prevent_hard_delete BEFORE DELETE ON projects.institutional_team FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();
--> statement-breakpoint
CREATE FUNCTION iam.guard_user_notification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ctx record;
BEGIN
  SELECT * INTO STRICT ctx FROM audit.context_values();
  IF TG_OP='INSERT' THEN
    IF ctx.actor_account_id IS DISTINCT FROM NEW.sender_account_id OR NOT EXISTS(
      SELECT 1 FROM projects.institutional_team t WHERE t.id=NEW.event_key AND t.account_id=NEW.recipient_account_id AND t.removed_at IS NULL AND
      ((NEW.resource_kind='activity' AND t.activity_id=NEW.resource_id) OR (NEW.resource_kind='agreement' AND t.agreement_id=NEW.resource_id) OR (NEW.resource_kind='project' AND t.project_id=NEW.resource_id))
    ) THEN RAISE EXCEPTION 'Notification must belong to a verified assignment' USING ERRCODE='23514'; END IF;
    NEW.read_at:=NULL;
  ELSE
    IF ctx.actor_account_id IS DISTINCT FROM OLD.recipient_account_id OR (to_jsonb(NEW)-'read_at') IS DISTINCT FROM (to_jsonb(OLD)-'read_at') OR (OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at) THEN
      RAISE EXCEPTION 'Notification contents are immutable' USING ERRCODE='23514';
    END IF;
    NEW.read_at:=COALESCE(OLD.read_at,clock_timestamp());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER b10_notification_guard BEFORE INSERT OR UPDATE ON iam.user_notification FOR EACH ROW EXECUTE FUNCTION iam.guard_user_notification();
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE ON iam.user_notification FOR EACH ROW EXECUTE FUNCTION audit.record_row_change();
CREATE TRIGGER prevent_hard_delete BEFORE DELETE ON iam.user_notification FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();
--> statement-breakpoint
CREATE FUNCTION projects.install_access_catalog() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  PERFORM audit.set_system_context('install-institutional-access',gen_random_uuid());
  INSERT INTO iam.permission(code,description) VALUES
    ('institutional.manage','Manage institutional records, teams and results.'),
    ('institutional.read_assigned','Read institutional records assigned to the current account.'),
    ('notifications.read_own','Read and acknowledge personal in-app notifications.') ON CONFLICT(code) DO NOTHING;
  INSERT INTO iam.role_permission(role_id,permission_id)
    SELECT r.id,p.id FROM (VALUES
      ('director','institutional.manage'),('psychologist','institutional.read_assigned'),('assistant','institutional.read_assigned'),('degree_student','institutional.read_assigned'),
      ('director','notifications.read_own'),('psychologist','notifications.read_own'),('assistant','notifications.read_own'),('degree_student','notifications.read_own')
    ) AS definition(role_code,permission_code)
    JOIN iam.role r ON r.code=definition.role_code JOIN iam.permission p ON p.code=definition.permission_code
    WHERE NOT EXISTS(SELECT 1 FROM iam.role_permission rp WHERE rp.role_id=r.id AND rp.permission_id=p.id);
END $$;
REVOKE ALL ON FUNCTION projects.install_access_catalog() FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM iam.role) THEN PERFORM projects.install_access_catalog(); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gabinete_app') THEN
    GRANT USAGE ON SCHEMA projects TO gabinete_app;
    GRANT SELECT ON projects.activity,projects.agreement,projects.project,projects.institutional_team,iam.user_notification TO gabinete_app;
    GRANT INSERT,UPDATE ON core.institution,projects.activity,projects.agreement,projects.project,projects.institutional_team,iam.user_notification TO gabinete_app;
  END IF;
END $$;
