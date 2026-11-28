-- Editable labels are independent of elapsed time. Preserve prior metadata in immutable revisions.
ALTER TABLE practicum.time_entry_revision
  ADD COLUMN previous_task_id uuid,
  ADD COLUMN previous_task_title varchar(180),
  ADD COLUMN previous_project_label varchar(180);
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
    IF ROW(NEW.placement_id,NEW.student_person_id,NEW.entry_source,NEW.case_id)
      IS DISTINCT FROM ROW(OLD.placement_id,OLD.student_person_id,OLD.entry_source,OLD.case_id)
      THEN RAISE EXCEPTION 'Entry identity is immutable' USING ERRCODE='23514'; END IF;
    IF OLD.voided_at IS NOT NULL THEN RAISE EXCEPTION 'A deleted entry is immutable' USING ERRCODE='23514'; END IF;
    IF NEW.started_at IS DISTINCT FROM OLD.started_at THEN
      RAISE EXCEPTION 'The start time is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.ended_at IS DISTINCT FROM OLD.ended_at AND NOT (
      OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL AND OLD.entry_source='timer'
      AND NEW.change_reason='Timer stopped'
      AND ROW(NEW.task_id,NEW.task_title,NEW.project_label,NEW.activity_kind,NEW.description,NEW.voided_at)
        IS NOT DISTINCT FROM ROW(OLD.task_id,OLD.task_title,OLD.project_label,OLD.activity_kind,OLD.description,OLD.voided_at)
    ) THEN RAISE EXCEPTION 'Only a running timer can set its end time' USING ERRCODE='23514'; END IF;
    IF ROW(NEW.task_id,NEW.task_title,NEW.project_label,NEW.activity_kind)
      IS DISTINCT FROM ROW(OLD.task_id,OLD.task_title,OLD.project_label,OLD.activity_kind) THEN
      SELECT * INTO STRICT task FROM practicum.work_task WHERE id=NEW.task_id AND placement_id=NEW.placement_id;
      IF task.task_status<>'active' OR ROW(NEW.task_title,NEW.project_label,NEW.activity_kind)
        IS DISTINCT FROM ROW(task.title,task.project_label,task.activity_kind) THEN
        RAISE EXCEPTION 'Entry details must match a task in the same practice' USING ERRCODE='23514';
      END IF;
    END IF;
    NEW.version_no := OLD.version_no+1;
    IF NEW.voided_at IS NOT NULL THEN
      NEW.voided_at := clock_timestamp(); revision_action := 'voided';
    ELSIF OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL AND NEW.change_reason='Timer stopped' THEN
      revision_action := 'stopped';
    ELSE revision_action := 'corrected'; END IF;
    IF NEW.change_reason IS NULL OR length(btrim(NEW.change_reason)) NOT BETWEEN 5 AND 500 THEN
      RAISE EXCEPTION 'A change reason is required' USING ERRCODE='23514';
    END IF;
    NEW.approval_status := 'recorded'; NEW.approved_by_account_id := NULL; NEW.approved_at := NULL;
    INSERT INTO practicum.time_entry_revision(entry_id,action,reason,previous_started_at,previous_ended_at,previous_description,
      previous_task_id,previous_task_title,previous_project_label,actor_account_id,auth_session_id,request_id,system_actor)
      VALUES(OLD.id,revision_action,NEW.change_reason,OLD.started_at,OLD.ended_at,OLD.description,
      OLD.task_id,OLD.task_title,OLD.project_label,ctx.actor_account_id,ctx.auth_session_id,ctx.request_id,ctx.system_actor);
  END IF;
  IF NEW.voided_at IS NULL AND (NEW.started_at>clock_timestamp() OR NEW.ended_at>clock_timestamp()) THEN
    RAISE EXCEPTION 'Future time is not allowed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
