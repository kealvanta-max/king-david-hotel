-- King David: authoritative domain, default-deny tenancy and canonical inventory.
-- Run as migration owner, never as the application login role.
BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE properties (
  id uuid NOT NULL, tenant_id uuid NOT NULL, property_id uuid NOT NULL,
  data jsonb NOT NULL, sequence_number bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (tenant_id,property_id,id),
  CONSTRAINT property_primary_identity CHECK(id=property_id),
  CONSTRAINT property_data_scope CHECK ((data->>'id')::uuid=id AND (data->>'tenantId')::uuid=tenant_id AND (data->>'propertyId')::uuid=property_id)
);
CREATE TABLE domain_entity_tables (table_name text PRIMARY KEY);
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['room_types','function_spaces','resources','event_inquiries','quote_versions','events','sub_events','inventory_allocations','room_blocks','rooming_list_entries','guest_profiles','company_profiles','products','packages','payment_requests','webhook_receipts','refunds','folios','folio_lines','invoices','function_sheets','tasks','message_deliveries','audit_entries','content_fields','idempotency_receipts'] LOOP
    EXECUTE format('CREATE TABLE %I (id uuid NOT NULL, tenant_id uuid NOT NULL, property_id uuid NOT NULL, data jsonb NOT NULL, sequence_number bigint GENERATED ALWAYS AS IDENTITY, PRIMARY KEY (tenant_id,property_id,id), FOREIGN KEY (tenant_id,property_id,property_id) REFERENCES properties(tenant_id,property_id,id), CHECK ((data->>''id'')::uuid=id AND (data->>''tenantId'')::uuid=tenant_id AND (data->>''propertyId'')::uuid=property_id))',t);
    EXECUTE format('INSERT INTO domain_entity_tables VALUES (%L)',t);
    EXECUTE format('CREATE INDEX %I ON %I (tenant_id,property_id,((data->>''enquiryId'')))',t||'_enquiry_idx',t);
  END LOOP;
END $$;
ALTER TABLE inventory_allocations
  ADD COLUMN resource_kind text NOT NULL CHECK(resource_kind IN ('room_type','space','resource')),
  ADD COLUMN resource_id uuid NOT NULL,
  ADD COLUMN request_id uuid NOT NULL,
  ADD COLUMN during tstzrange NOT NULL,
  ADD COLUMN quantity integer NOT NULL CHECK(quantity>0),
  ADD COLUMN state text NOT NULL CHECK(state IN ('held','confirmed','released','expired','cancelled')),
  ADD COLUMN expires_at timestamptz,
  ADD CHECK(NOT isempty(during)),
  ADD CHECK(state<>'held' OR expires_at IS NOT NULL),
  ADD CONSTRAINT unique_resource_request UNIQUE(tenant_id,property_id,request_id,resource_kind,resource_id,during,state),
  ADD CONSTRAINT no_space_resource_double_allocation EXCLUDE USING gist(tenant_id WITH =,property_id WITH =,resource_kind WITH =,resource_id WITH =,during WITH &&) WHERE(state IN ('held','confirmed') AND resource_kind IN ('space','resource'));
CREATE INDEX allocation_availability_idx ON inventory_allocations(tenant_id,property_id,resource_kind,resource_id,state,during);
CREATE INDEX allocation_expiry_idx ON inventory_allocations(expires_at) WHERE state='held';
-- Room types are aggregate inventory. Lock the property before checking/writing;
-- this constraint trigger also rejects over-allocation from other DB sessions.
CREATE FUNCTION check_room_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE capacity integer; occupied integer;
BEGIN
  IF NEW.resource_kind<>'room_type' OR NEW.state NOT IN ('held','confirmed') THEN RETURN NEW; END IF;
  IF NEW.state='held' AND NEW.expires_at<=statement_timestamp() THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':'||NEW.property_id::text,0));
  IF NEW.resource_kind='room_type' THEN
    SELECT (data->>'total')::integer INTO capacity FROM room_types WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.resource_id;
  ELSE
    SELECT (data->>'quantity')::integer INTO capacity FROM resources WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.resource_id;
  END IF;
  IF capacity IS NULL THEN RAISE EXCEPTION 'Unknown inventory resource' USING ERRCODE='23514'; END IF;
  SELECT COALESCE(sum(quantity),0) INTO occupied FROM inventory_allocations
    WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND resource_kind=NEW.resource_kind AND resource_id=NEW.resource_id AND state IN ('held','confirmed') AND (state='confirmed' OR expires_at>statement_timestamp()) AND during && NEW.during AND id<>NEW.id;
  IF occupied+NEW.quantity>capacity THEN RAISE EXCEPTION 'Inventory capacity exceeded' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enforce_room_capacity BEFORE INSERT OR UPDATE ON inventory_allocations FOR EACH ROW EXECUTE FUNCTION check_room_capacity();
CREATE UNIQUE INDEX payment_reference_idx ON payment_requests(tenant_id,property_id,(data->>'reference'));
CREATE UNIQUE INDEX webhook_dedupe_idx ON webhook_receipts(tenant_id,property_id,(data->>'provider'),(data->>'eventId'));
CREATE UNIQUE INDEX idempotency_key_idx ON idempotency_receipts(tenant_id,property_id,(data->>'key'));
CREATE UNIQUE INDEX quote_version_idx ON quote_versions(tenant_id,property_id,(data->>'enquiryId'),(data->>'version'));
CREATE UNIQUE INDEX content_key_idx ON content_fields(tenant_id,property_id,(data->>'key'));
CREATE FUNCTION protect_accepted_quote() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN IF OLD.data->>'status'='accepted' THEN RAISE EXCEPTION 'Accepted quotes cannot be deleted'; END IF; RETURN OLD; END IF;
  IF OLD.data->>'status'='accepted' THEN
    -- Only deposit fulfilment state may change; commercial terms and acceptance evidence are immutable.
    IF (NEW.data - 'deposits') IS DISTINCT FROM (OLD.data - 'deposits') THEN RAISE EXCEPTION 'Accepted quote commercial terms are immutable'; END IF;
    IF (SELECT jsonb_agg(x - 'state' - 'paymentRequestId' ORDER BY x->>'id') FROM jsonb_array_elements(NEW.data->'deposits') x) IS DISTINCT FROM
       (SELECT jsonb_agg(x - 'state' - 'paymentRequestId' ORDER BY x->>'id') FROM jsonb_array_elements(OLD.data->'deposits') x) THEN
      RAISE EXCEPTION 'Accepted deposit terms are immutable';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_accepted_quote BEFORE UPDATE OR DELETE ON quote_versions FOR EACH ROW EXECUTE FUNCTION protect_accepted_quote();
CREATE FUNCTION append_only_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit entries are append-only'; END $$;
CREATE TRIGGER no_audit_mutation BEFORE UPDATE OR DELETE ON audit_entries FOR EACH ROW EXECUTE FUNCTION append_only_audit();
CREATE TABLE staff_identities (
  subject text NOT NULL, issuer text NOT NULL, tenant_id uuid NOT NULL, property_ids uuid[] NOT NULL,
  role text NOT NULL CHECK(role IN ('admin','manager','front_desk','events','operations','finance','readonly')),
  display_name text NOT NULL, disabled boolean NOT NULL DEFAULT false, sessions_valid_after timestamptz NOT NULL DEFAULT '-infinity',
  PRIMARY KEY(issuer,subject)
);
CREATE TABLE portal_sessions (
  token_hash text PRIMARY KEY, tenant_id uuid NOT NULL, property_id uuid NOT NULL, enquiry_id uuid NOT NULL,
  expires_at timestamptz NOT NULL, revoked_at timestamptz,
  FOREIGN KEY(tenant_id,property_id,enquiry_id) REFERENCES event_inquiries(tenant_id,property_id,id),
  CHECK(length(token_hash)=64)
);
CREATE TABLE reconciliation_batches (
  id uuid NOT NULL, tenant_id uuid NOT NULL, property_id uuid NOT NULL, data jsonb NOT NULL,
  PRIMARY KEY(tenant_id,property_id,id), FOREIGN KEY(tenant_id,property_id,property_id) REFERENCES properties(tenant_id,property_id,id)
);
-- Default deny. Runtime must use SET LOCAL set_config(..., true), never concatenate user input into SQL.
ALTER TABLE properties ENABLE ROW LEVEL SECURITY; ALTER TABLE properties FORCE ROW LEVEL SECURITY;
CREATE POLICY property_scope ON properties USING(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid AND property_id=ANY(string_to_array(NULLIF(current_setting('app.property_ids',true),''),',')::uuid[])) WITH CHECK(tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid AND property_id=ANY(string_to_array(NULLIF(current_setting('app.property_ids',true),''),',')::uuid[]));
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['room_types','function_spaces','resources','event_inquiries','quote_versions','events','sub_events','inventory_allocations','room_blocks','rooming_list_entries','guest_profiles','company_profiles','products','packages','payment_requests','webhook_receipts','refunds','folios','folio_lines','invoices','function_sheets','tasks','message_deliveries','audit_entries','content_fields','idempotency_receipts','portal_sessions','reconciliation_batches'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY tenant_property_scope ON %I USING(tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid AND property_id=ANY(string_to_array(NULLIF(current_setting(''app.property_ids'',true),''''),'','')::uuid[])) WITH CHECK(tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid AND property_id=ANY(string_to_array(NULLIF(current_setting(''app.property_ids'',true),''''),'','')::uuid[]))',t);
  END LOOP;
END $$;
-- A portal lookup can only read the exact unexpired hash, never enumerate sessions.
CREATE POLICY portal_capability_lookup ON portal_sessions FOR SELECT USING(token_hash=NULLIF(current_setting('app.portal_token_hash',true),'') AND expires_at>statement_timestamp() AND revoked_at IS NULL);
ALTER TABLE staff_identities ENABLE ROW LEVEL SECURITY; ALTER TABLE staff_identities FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_lookup ON staff_identities FOR SELECT USING(subject=NULLIF(current_setting('app.auth_subject',true),'') AND issuer=NULLIF(current_setting('app.auth_issuer',true),'') AND NOT disabled);
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='king_david_runtime') THEN CREATE ROLE king_david_runtime NOLOGIN NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOBYPASSRLS; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO king_david_runtime;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO king_david_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO king_david_runtime;
REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM king_david_runtime;
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM king_david_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE DELETE,TRUNCATE ON TABLES FROM king_david_runtime;
INSERT INTO schema_migrations(version) VALUES('001_domain');
COMMIT;
