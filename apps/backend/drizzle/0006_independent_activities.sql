-- Supervisors are optional historical metadata, never a prerequisite for time tracking.
ALTER TABLE practicum.placement ALTER COLUMN supervisor_account_id DROP NOT NULL;
