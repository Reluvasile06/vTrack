-- Vault helpers for Stage 1 DJI credential storage (service-role / SECURITY DEFINER)

CREATE OR REPLACE FUNCTION public.store_org_dji_vault_secrets(
  p_organization_id UUID,
  p_user_token TEXT,
  p_project_uuid TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_token_id UUID;
  v_project_id UUID;
BEGIN
  IF NOT public.has_org_role(p_organization_id, 'b2b_admin') AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_token_id := vault.create_secret(
    p_user_token,
    'dji_user_token_' || p_organization_id::text,
    'DJI X-User-Token for org ' || p_organization_id::text
  );

  v_project_id := vault.create_secret(
    p_project_uuid,
    'dji_project_uuid_' || p_organization_id::text,
    'DJI X-Project-Uuid for org ' || p_organization_id::text
  );

  INSERT INTO public.organization_dji_credentials (
    organization_id, vault_user_token_id, vault_project_uuid_id, last_verify_status, updated_at
  ) VALUES (
    p_organization_id, v_token_id, v_project_id, 'stored', NOW()
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    vault_user_token_id = EXCLUDED.vault_user_token_id,
    vault_project_uuid_id = EXCLUDED.vault_project_uuid_id,
    last_verify_status = 'stored',
    updated_at = NOW();

  RETURN jsonb_build_object(
    'vault_user_token_id', v_token_id,
    'vault_project_uuid_id', v_project_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.read_dji_vault_secrets(
  p_user_token_id UUID,
  p_project_uuid_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_token TEXT;
  v_project TEXT;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;

  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets WHERE id = p_user_token_id;

  SELECT decrypted_secret INTO v_project
  FROM vault.decrypted_secrets WHERE id = p_project_uuid_id;

  RETURN jsonb_build_object(
    'user_token', v_token,
    'project_uuid', v_project
  );
END;
$$;

REVOKE ALL ON FUNCTION public.store_org_dji_vault_secrets(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.store_org_dji_vault_secrets(UUID, TEXT, TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.read_dji_vault_secrets(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_dji_vault_secrets(UUID, UUID) TO service_role;
