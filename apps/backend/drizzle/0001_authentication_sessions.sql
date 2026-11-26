-- Preserve existing accounts, grants and historical audit triggers.
ALTER TABLE iam.auth_session ADD COLUMN session_kind varchar(30) NOT NULL DEFAULT 'interactive';
ALTER TABLE iam.auth_session ADD CONSTRAINT auth_session_kind_check
  CHECK (session_kind IN ('interactive','account_activation','password_reset'));
ALTER TABLE iam.auth_session ADD CONSTRAINT action_session_is_closed
  CHECK (session_kind='interactive' OR revoked_at IS NOT NULL);

CREATE FUNCTION iam.protect_session_kind() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.session_kind IS DISTINCT FROM OLD.session_kind THEN
    RAISE EXCEPTION 'A session kind is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER auth_session_kind_guard BEFORE UPDATE OF session_kind ON iam.auth_session
  FOR EACH ROW EXECUTE FUNCTION iam.protect_session_kind();

CREATE TABLE audit.security_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id uuid NOT NULL,
  event_type varchar(30) NOT NULL CHECK (event_type IN
    ('sign_in_succeeded','sign_in_failed','sign_in_throttled','sign_out_succeeded')),
  subject_hash bytea NOT NULL CHECK (octet_length(subject_hash)=32),
  actor_account_id uuid REFERENCES iam.account(id) ON DELETE RESTRICT,
  auth_session_id uuid,
  CONSTRAINT security_session_owner FOREIGN KEY(auth_session_id,actor_account_id)
    REFERENCES iam.auth_session(id,account_id) ON DELETE RESTRICT,
  CONSTRAINT security_actor_check CHECK (
    (event_type IN ('sign_in_failed','sign_in_throttled') AND actor_account_id IS NULL AND auth_session_id IS NULL)
    OR (event_type IN ('sign_in_succeeded','sign_out_succeeded') AND actor_account_id IS NOT NULL AND auth_session_id IS NOT NULL)
  )
);
CREATE INDEX security_subject_failure_idx ON audit.security_event(subject_hash,occurred_at DESC)
  WHERE event_type='sign_in_failed';
CREATE INDEX security_actor_time_idx ON audit.security_event(actor_account_id,occurred_at DESC);
CREATE TRIGGER security_event_immutable BEFORE UPDATE OR DELETE ON audit.security_event
  FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();

CREATE FUNCTION audit.record_auth_event(p_request uuid,p_type text,p_subject bytea,
  p_actor uuid DEFAULT NULL,p_session uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ctx record;
BEGIN
  IF p_type IN ('sign_in_succeeded','sign_out_succeeded') THEN
    SELECT * INTO STRICT ctx FROM audit.context_values();
    IF ctx.actor_kind <> 'human' OR ctx.actor_account_id IS DISTINCT FROM p_actor
       OR ctx.auth_session_id IS DISTINCT FROM p_session OR ctx.request_id IS DISTINCT FROM p_request THEN
      RAISE EXCEPTION 'Authenticated security events require their verified request context' USING ERRCODE='22023';
    END IF;
  END IF;
  INSERT INTO audit.security_event(request_id,event_type,subject_hash,actor_account_id,auth_session_id)
    VALUES(p_request,p_type,p_subject,p_actor,p_session);
END $$;
REVOKE ALL ON audit.security_event FROM PUBLIC;
REVOKE ALL ON SEQUENCE audit.security_event_id_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION audit.record_auth_event(uuid,text,bytea,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION iam.protect_session_kind() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gabinete_app') THEN
    GRANT SELECT ON audit.security_event TO gabinete_app;
    GRANT EXECUTE ON FUNCTION audit.record_auth_event(uuid,text,bytea,uuid,uuid) TO gabinete_app;
  END IF;
END $$;
