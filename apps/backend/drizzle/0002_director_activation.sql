-- One-use account actions preserve their history and never authenticate browsing.
CREATE TABLE iam.account_action_token (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES iam.account(id) ON DELETE RESTRICT,
  purpose varchar(30) NOT NULL CHECK(purpose IN ('director_activation','operational_activation','password_reset')),
  token_hash bytea NOT NULL UNIQUE CHECK(octet_length(token_hash)=32),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_by_session_id uuid,
  revoked_at timestamptz,
  CONSTRAINT action_consumption_session FOREIGN KEY(consumed_by_session_id,account_id)
    REFERENCES iam.auth_session(id,account_id) ON DELETE RESTRICT,
  CONSTRAINT action_expiration CHECK(expires_at>created_at),
  CONSTRAINT action_consumption CHECK((consumed_at IS NULL)=(consumed_by_session_id IS NULL)
    AND (consumed_at IS NULL OR consumed_at>=created_at)),
  CONSTRAINT action_revocation CHECK(revoked_at IS NULL OR (revoked_at>=created_at AND consumed_at IS NULL))
);
CREATE UNIQUE INDEX pending_account_action_uq ON iam.account_action_token(account_id,purpose)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;
CREATE INDEX account_action_account_idx ON iam.account_action_token(account_id,created_at DESC);
CREATE FUNCTION iam.protect_account_action() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='UPDATE' AND (ROW(NEW.id,NEW.account_id,NEW.purpose,NEW.token_hash,NEW.created_at,NEW.expires_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.account_id,OLD.purpose,OLD.token_hash,OLD.created_at,OLD.expires_at)
    OR (OLD.consumed_at IS NOT NULL AND ROW(NEW.consumed_at,NEW.consumed_by_session_id)
      IS DISTINCT FROM ROW(OLD.consumed_at,OLD.consumed_by_session_id))
    OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)) THEN
    RAISE EXCEPTION 'Account action identity and terminal states are immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.consumed_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM iam.auth_session s
    WHERE s.id=NEW.consumed_by_session_id AND s.account_id=NEW.account_id AND s.revoked_at IS NOT NULL
      AND s.session_kind=CASE WHEN NEW.purpose='password_reset' THEN 'password_reset' ELSE 'account_activation' END) THEN
    RAISE EXCEPTION 'Account actions require their closed action session' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER account_action_guard BEFORE INSERT OR UPDATE ON iam.account_action_token FOR EACH ROW EXECUTE FUNCTION iam.protect_account_action();
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE ON iam.account_action_token FOR EACH ROW EXECUTE FUNCTION audit.record_row_change();
CREATE TRIGGER prevent_hard_delete BEFORE DELETE ON iam.account_action_token FOR EACH ROW EXECUTE FUNCTION audit.prevent_mutation();

-- All governance transactions use this lock; the trigger also protects direct grants.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM iam.account_role ar JOIN iam.role r ON r.id=ar.role_id
    WHERE r.code='director' AND ar.revoked_at IS NULL GROUP BY ar.role_id HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Resolve duplicate director grants before applying this migration';
  END IF;
END $$;
CREATE FUNCTION iam.protect_single_director() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.revoked_at IS NULL AND EXISTS(SELECT 1 FROM iam.role WHERE id=NEW.role_id AND code='director') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('gabinete.identity.administration',0));
    IF EXISTS(SELECT 1 FROM iam.account_role WHERE role_id=NEW.role_id AND revoked_at IS NULL AND id<>NEW.id) THEN
      RAISE EXCEPTION 'Only one director grant may remain active' USING ERRCODE='23505',CONSTRAINT='single_active_director';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER single_director_guard BEFORE INSERT OR UPDATE ON iam.account_role FOR EACH ROW EXECUTE FUNCTION iam.protect_single_director();
REVOKE ALL ON iam.account_action_token FROM PUBLIC;
REVOKE ALL ON FUNCTION iam.protect_account_action(),iam.protect_single_director() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='gabinete_app') THEN
    GRANT SELECT,INSERT,UPDATE ON iam.account_action_token TO gabinete_app;
    GRANT INSERT ON core.person TO gabinete_app;
    GRANT INSERT,UPDATE ON iam.account_role TO gabinete_app;
    GRANT INSERT,UPDATE ON iam.account,iam.auth_session TO gabinete_app;
  END IF;
END $$;
