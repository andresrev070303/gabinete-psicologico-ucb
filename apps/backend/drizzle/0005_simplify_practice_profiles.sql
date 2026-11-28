-- Simplified practice profiles: one person, one history, active or completed.
SELECT audit.set_system_context('migration-simplify-practice', gen_random_uuid());
--> statement-breakpoint
-- Do not merge or discard existing histories implicitly.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM practicum.placement GROUP BY student_person_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Multiple practice histories exist for one person. Review them before applying the simplified profile migration.';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE practicum.placement ALTER COLUMN term_id DROP NOT NULL,
  ALTER COLUMN placement_kind DROP NOT NULL,
  ALTER COLUMN placement_status SET DEFAULT 'active';
UPDATE practicum.placement
  SET placement_status=CASE WHEN placement_status='planned' THEN 'active' ELSE 'completed' END,
      change_reason='Simplify practice lifecycle'
  WHERE placement_status IN ('planned','withdrawn');
ALTER TABLE practicum.placement DROP CONSTRAINT placement_placement_status_check,
  ADD CONSTRAINT placement_placement_status_check CHECK(placement_status IN ('active','completed'));
DROP INDEX practicum.one_active_placement_per_student;
CREATE UNIQUE INDEX one_practice_per_student ON practicum.placement(student_person_id);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION practicum.guard_time_entry() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE placement record; task record; revision_action text; ctx record;
BEGIN
  SELECT * INTO STRICT ctx FROM audit.context_values();
  SELECT student_person_id INTO STRICT placement FROM practicum.placement WHERE id=NEW.placement_id;
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
  IF NEW.voided_at IS NULL AND (NEW.started_at>clock_timestamp() OR NEW.ended_at>clock_timestamp()) THEN
    RAISE EXCEPTION 'Future time is not allowed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
