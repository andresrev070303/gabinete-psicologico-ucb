-- Practice time is recorded directly. No director approval workflow is introduced.
SELECT audit.set_system_context('migration-practicum-tracking', gen_random_uuid());
--> statement-breakpoint
ALTER TABLE practicum.placement ADD COLUMN version_no integer NOT NULL DEFAULT 1,
  ADD COLUMN change_reason varchar(500),
  ADD CONSTRAINT placement_version_check CHECK (version_no > 0);
CREATE UNIQUE INDEX one_active_placement_per_student ON practicum.placement(student_person_id) WHERE placement_status='active';
--> statement-breakpoint
CREATE TABLE practicum.work_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id uuid NOT NULL REFERENCES practicum.placement(id) ON DELETE RESTRICT,
  title varchar(180) NOT NULL CHECK(length(btrim(title)) BETWEEN 3 AND 180),
  project_label varchar(180) NOT NULL CHECK(length(btrim(project_label)) BETWEEN 1 AND 180),
  activity_kind varchar(70) NOT NULL CHECK(activity_kind IN ('administration','direct_care','evaluation_support','workshop','research','training','other')),
  description varchar(2000),
  task_status varchar(20) NOT NULL DEFAULT 'active' CHECK(task_status IN ('active','completed','archived')),
  assigned_by_director boolean NOT NULL DEFAULT false,
  version_no integer NOT NULL DEFAULT 1 CHECK(version_no>0),
  change_reason varchar(500),
  created_by_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  updated_by_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT work_task_id_placement_key UNIQUE(id,placement_id)
);
CREATE INDEX work_task_placement_idx ON practicum.work_task(placement_id,id DESC);
CREATE TRIGGER a00_request_authorship BEFORE INSERT OR UPDATE ON practicum.work_task FOR EACH ROW EXECUTE FUNCTION audit.stamp_authorship();
CREATE TRIGGER touch_timestamp BEFORE UPDATE ON practicum.work_task FOR EACH ROW EXECUTE FUNCTION audit.touch_updated_at();
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE ON practicum.work_task FOR EACH ROW EXECUTE FUNCTION audit.record_row_change();
CREATE TRIGGER prevent_hard_delete BEFORE DELETE ON practicum.work_task FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();
CREATE TRIGGER prevent_hard_delete BEFORE DELETE ON practicum.placement FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();
--> statement-breakpoint
DROP TRIGGER b10_activity_approval ON practicum.activity_log;
ALTER TABLE practicum.activity_log ALTER COLUMN ended_at DROP NOT NULL,
  ALTER COLUMN approval_status SET DEFAULT 'recorded',
  DROP CONSTRAINT activity_log_approval_status_check,
  ADD CONSTRAINT activity_log_approval_status_check CHECK(approval_status IN ('pending','approved','rejected','recorded')),
  ADD COLUMN student_person_id uuid REFERENCES core.person(id) ON DELETE RESTRICT,
  ADD COLUMN task_id uuid,
  ADD COLUMN task_title varchar(180),
  ADD COLUMN project_label varchar(180) NOT NULL DEFAULT 'Gabinete',
  ADD COLUMN entry_source varchar(10) NOT NULL DEFAULT 'manual' CHECK(entry_source IN ('manual','timer')),
  ADD COLUMN version_no integer NOT NULL DEFAULT 1 CHECK(version_no>0),
  ADD COLUMN voided_at timestamptz,
  ADD COLUMN change_reason varchar(500),
  ADD CONSTRAINT activity_task_placement_fk FOREIGN KEY(task_id,placement_id) REFERENCES practicum.work_task(id,placement_id) ON DELETE RESTRICT,
  ADD CONSTRAINT manual_entry_needs_end CHECK(entry_source='timer' OR ended_at IS NOT NULL),
  ADD CONSTRAINT voided_entry_needs_reason CHECK(voided_at IS NULL OR length(btrim(change_reason)) BETWEEN 5 AND 500);
UPDATE practicum.activity_log l SET student_person_id=p.student_person_id,task_title=left(l.activity_kind,180) FROM practicum.placement p WHERE p.id=l.placement_id;
ALTER TABLE practicum.activity_log ALTER COLUMN student_person_id SET NOT NULL, ALTER COLUMN task_title SET NOT NULL;
-- Adjacent intervals are valid. Open timers reserve [start,infinity) until stopped or voided.
ALTER TABLE practicum.activity_log ADD CONSTRAINT practice_entries_do_not_overlap EXCLUDE USING gist
  (student_person_id WITH =, tstzrange(started_at,ended_at,'[)') WITH &&) WHERE(voided_at IS NULL);
CREATE UNIQUE INDEX one_running_practice_timer ON practicum.activity_log(student_person_id) WHERE ended_at IS NULL AND voided_at IS NULL;
CREATE INDEX practice_entry_page_idx ON practicum.activity_log(placement_id,started_at DESC,id DESC);
CREATE TRIGGER prevent_hard_delete BEFORE DELETE ON practicum.activity_log FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();
--> statement-breakpoint
CREATE TABLE practicum.time_entry_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES practicum.activity_log(id) ON DELETE RESTRICT,
  action varchar(20) NOT NULL CHECK(action IN ('stopped','corrected','voided')),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason varchar(500) NOT NULL,
  previous_started_at timestamptz NOT NULL,
  previous_ended_at timestamptz,
  previous_description text,
  actor_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  auth_session_id uuid,
  request_id uuid NOT NULL,
  system_actor text,
  FOREIGN KEY(auth_session_id,actor_account_id) REFERENCES iam.auth_session(id,account_id) ON DELETE RESTRICT
);
CREATE INDEX time_entry_revision_entry_idx ON practicum.time_entry_revision(entry_id,changed_at DESC,id DESC);
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON practicum.time_entry_revision FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();
--> statement-breakpoint
CREATE FUNCTION practicum.guard_time_entry() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE placement record; task record; lower_bound timestamptz; upper_bound timestamptz; revision_action text; ctx record;
BEGIN
  SELECT * INTO STRICT ctx FROM audit.context_values();
  SELECT p.student_person_id,COALESCE(p.started_on,t.starts_on) AS starts_on,COALESCE(p.ended_on,t.ends_on) AS ends_on
    INTO STRICT placement FROM practicum.placement p JOIN practicum.academic_term t ON t.id=p.term_id WHERE p.id=NEW.placement_id;
  lower_bound := placement.starts_on::timestamp AT TIME ZONE 'America/La_Paz';
  upper_bound := (placement.ends_on+1)::timestamp AT TIME ZONE 'America/La_Paz';
  IF TG_OP='INSERT' THEN
    NEW.student_person_id := placement.student_person_id;
    NEW.version_no := 1;
    NEW.approval_status := 'recorded'; NEW.approved_by_account_id := NULL; NEW.approved_at := NULL;
    IF NEW.task_id IS NULL THEN RAISE EXCEPTION 'A task is required' USING ERRCODE='23514'; END IF;
    SELECT * INTO STRICT task FROM practicum.work_task WHERE id=NEW.task_id AND placement_id=NEW.placement_id;
    IF task.task_status<>'active' THEN RAISE EXCEPTION 'Task is not active' USING ERRCODE='23514'; END IF;
    NEW.task_title := task.title; NEW.project_label := task.project_label; NEW.activity_kind := task.activity_kind;
  ELSE
    IF ROW(NEW.placement_id,NEW.student_person_id,NEW.task_id,NEW.entry_source,NEW.task_title,NEW.project_label,NEW.activity_kind,NEW.case_id)
      IS DISTINCT FROM ROW(OLD.placement_id,OLD.student_person_id,OLD.task_id,OLD.entry_source,OLD.task_title,OLD.project_label,OLD.activity_kind,OLD.case_id)
      THEN RAISE EXCEPTION 'Entry identity is immutable' USING ERRCODE='23514'; END IF;
    IF OLD.voided_at IS NOT NULL THEN RAISE EXCEPTION 'A voided entry is immutable' USING ERRCODE='23514'; END IF;
    NEW.version_no := OLD.version_no+1;
    IF NEW.voided_at IS NOT NULL THEN
      NEW.voided_at := clock_timestamp(); revision_action := 'voided';
    ELSIF OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL AND ROW(NEW.started_at,NEW.description) IS NOT DISTINCT FROM ROW(OLD.started_at,OLD.description)
      AND NEW.change_reason='Timer stopped' THEN revision_action := 'stopped';
    ELSE revision_action := 'corrected'; END IF;
    IF NEW.change_reason IS NULL OR length(btrim(NEW.change_reason)) NOT BETWEEN 5 AND 500 THEN
      RAISE EXCEPTION 'A correction reason is required' USING ERRCODE='23514';
    END IF;
    NEW.approval_status := 'recorded'; NEW.approved_by_account_id := NULL; NEW.approved_at := NULL;
    INSERT INTO practicum.time_entry_revision(entry_id,action,reason,previous_started_at,previous_ended_at,previous_description,actor_account_id,auth_session_id,request_id,system_actor)
      VALUES(OLD.id,revision_action,NEW.change_reason,OLD.started_at,OLD.ended_at,OLD.description,ctx.actor_account_id,ctx.auth_session_id,ctx.request_id,ctx.system_actor);
  END IF;
  IF NEW.voided_at IS NULL AND (NEW.started_at<lower_bound OR NEW.started_at>=upper_bound OR NEW.started_at>clock_timestamp()
      OR NEW.ended_at>upper_bound OR NEW.ended_at>clock_timestamp()) THEN
    RAISE EXCEPTION 'Time interval is outside the practice period' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER b10_practicum_interval BEFORE INSERT OR UPDATE ON practicum.activity_log FOR EACH ROW EXECUTE FUNCTION practicum.guard_time_entry();
--> statement-breakpoint
CREATE FUNCTION practicum.guard_placement_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.change_reason IS NULL OR length(btrim(NEW.change_reason)) NOT BETWEEN 5 AND 500 THEN
      RAISE EXCEPTION 'A change reason is required' USING ERRCODE='23514';
    END IF;
    IF NEW.placement_status<>'active' AND EXISTS(SELECT 1 FROM practicum.activity_log WHERE placement_id=OLD.id AND ended_at IS NULL AND voided_at IS NULL) THEN
      RAISE EXCEPTION 'Stop the running timer before closing the placement' USING ERRCODE='23514';
    END IF;
    NEW.version_no := OLD.version_no+1;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER b10_practicum_placement BEFORE UPDATE ON practicum.placement FOR EACH ROW EXECUTE FUNCTION practicum.guard_placement_update();
CREATE FUNCTION practicum.guard_task_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF ROW(NEW.placement_id,NEW.title,NEW.project_label,NEW.activity_kind,NEW.description,NEW.assigned_by_director)
    IS DISTINCT FROM ROW(OLD.placement_id,OLD.title,OLD.project_label,OLD.activity_kind,OLD.description,OLD.assigned_by_director) THEN
    RAISE EXCEPTION 'Task contents are immutable; create a new task' USING ERRCODE='23514';
  END IF;
  IF NEW.task_status<>'active' AND EXISTS(SELECT 1 FROM practicum.activity_log WHERE task_id=OLD.id AND ended_at IS NULL AND voided_at IS NULL) THEN
    RAISE EXCEPTION 'Stop the task timer first' USING ERRCODE='23514';
  END IF;
  NEW.version_no := OLD.version_no+1;
  RETURN NEW;
END $$;
CREATE TRIGGER b10_practicum_task BEFORE UPDATE ON practicum.work_task FOR EACH ROW EXECUTE FUNCTION practicum.guard_task_update();
--> statement-breakpoint
CREATE VIEW reporting.v_practicum_recorded_hours AS
  SELECT p.id AS placement_id,p.student_person_id,
    floor(COALESCE(sum(extract(epoch FROM (l.ended_at-l.started_at))) FILTER(WHERE l.voided_at IS NULL AND l.ended_at IS NOT NULL),0))::bigint AS total_seconds
  FROM practicum.placement p LEFT JOIN practicum.activity_log l ON l.placement_id=p.id GROUP BY p.id,p.student_person_id;
--> statement-breakpoint
-- Owner-only and repeatable. Kept separate from identity bootstrap for fresh databases.
CREATE FUNCTION practicum.install_access_catalog() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  PERFORM audit.set_system_context('install-practicum-access',gen_random_uuid());
  INSERT INTO iam.permission(code,description) VALUES
    ('practicum.manage','Manage practice placements, assigned tasks and recorded hours.'),
    ('practicum.read_own','Read own practice placements and recorded hours.'),
    ('practicum.track_own','Record own practice time and tasks.'),
    ('practicum.read_supervised','Read assigned practice placements and hours.')
    ON CONFLICT(code) DO NOTHING;
  INSERT INTO iam.role_permission(role_id,permission_id)
    SELECT r.id,p.id FROM (VALUES
      ('director','practicum.manage'),('assistant','practicum.read_own'),('assistant','practicum.track_own'),
      ('degree_student','practicum.read_own'),('degree_student','practicum.track_own'),('psychologist','practicum.read_supervised')
    ) AS grant_definition(role_code,permission_code)
    JOIN iam.role r ON r.code=grant_definition.role_code JOIN iam.permission p ON p.code=grant_definition.permission_code
    WHERE NOT EXISTS(SELECT 1 FROM iam.role_permission rp WHERE rp.role_id=r.id AND rp.permission_id=p.id);
END $$;
REVOKE ALL ON FUNCTION practicum.install_access_catalog() FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM iam.role) THEN PERFORM practicum.install_access_catalog(); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gabinete_app') THEN
    GRANT USAGE ON SCHEMA practicum,reporting TO gabinete_app;
    GRANT SELECT ON practicum.academic_term,practicum.placement,practicum.work_task,practicum.activity_log,practicum.time_entry_revision,reporting.v_practicum_recorded_hours TO gabinete_app;
    GRANT INSERT ON practicum.academic_term,practicum.placement,practicum.work_task,practicum.activity_log TO gabinete_app;
    GRANT UPDATE ON practicum.placement,practicum.work_task,practicum.activity_log TO gabinete_app;
  END IF;
END $$;
