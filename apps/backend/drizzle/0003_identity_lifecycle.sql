-- Semantic identity actions complement the existing immutable row-level audit.
CREATE TABLE audit.identity_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  action varchar(40) NOT NULL CHECK(action IN ('operational_invited','profile_updated','roles_changed','account_disabled','account_reinvited',
    'password_reset_issued','account_activation','password_reset','session_revoked','password_changed','password_change_failed','contact_updated')),
  target_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  actor_account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  auth_session_id uuid NOT NULL,
  request_id uuid NOT NULL,
  reason varchar(240),
  CONSTRAINT identity_event_session_owner FOREIGN KEY(auth_session_id,actor_account_id) REFERENCES iam.auth_session(id,account_id) ON DELETE RESTRICT,
  CONSTRAINT identity_event_reason CHECK((action='account_disabled' AND length(trim(reason)) BETWEEN 5 AND 240 AND reason IS NOT NULL)
    OR (action<>'account_disabled' AND reason IS NULL))
);
CREATE INDEX identity_event_target_time_idx ON audit.identity_event(target_account_id,occurred_at DESC);
CREATE INDEX identity_event_actor_time_idx ON audit.identity_event(actor_account_id,occurred_at DESC);
CREATE TRIGGER identity_event_immutable BEFORE UPDATE OR DELETE ON audit.identity_event FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();
CREATE FUNCTION audit.record_identity_event(p_action text,p_target uuid,p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ctx record;
BEGIN
  SELECT * INTO STRICT ctx FROM audit.context_values();
  IF ctx.actor_kind<>'human' THEN RAISE EXCEPTION 'Identity actions require a verified human context' USING ERRCODE='22023'; END IF;
  INSERT INTO audit.identity_event(action,target_account_id,actor_account_id,auth_session_id,request_id,reason)
    VALUES(p_action,p_target,ctx.actor_account_id,ctx.auth_session_id,ctx.request_id,p_reason);
END $$;
REVOKE ALL ON audit.identity_event FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.record_identity_event(text,uuid,text) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gabinete_app') THEN
    GRANT SELECT ON audit.identity_event TO gabinete_app;
    GRANT EXECUTE ON FUNCTION audit.record_identity_event(text,uuid,text) TO gabinete_app;
    GRANT UPDATE ON core.person TO gabinete_app;
  END IF;
END $$;
