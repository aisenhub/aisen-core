-- CORE-ENTITLEMENT-001: prevent an internal RPC mistake from crediting
-- the wrong user/product for a valid historical Grant identifier.
-- Existing FK(grant_id) and FK(user_id,product_id) independently did not
-- prove those identities corresponded to the SAME Grant fact.
--
-- Migration must fail closed on any pre-existing mismatched ledger rows.
DO $$
BEGIN
 IF EXISTS (
   SELECT 1 FROM public.pro_credit_entries e
   JOIN public.entitlement_grants g ON g.id=e.grant_id
   WHERE e.user_id IS DISTINCT FROM g.user_id
      OR e.product_id IS DISTINCT FROM g.product_id
 ) THEN
   RAISE EXCEPTION 'CREDIT_GRANT_IDENTITY_MISMATCH';
 END IF;
END $$;
ALTER TABLE public.entitlement_grants
  ADD CONSTRAINT entitlement_grants_credit_identity_uniq
  UNIQUE (id,user_id,product_id);
ALTER TABLE public.pro_credit_entries
  ADD CONSTRAINT pro_credit_entries_grant_identity_fk
  FOREIGN KEY (grant_id,user_id,product_id)
  REFERENCES public.entitlement_grants(id,user_id,product_id)
  ON UPDATE RESTRICT ON DELETE RESTRICT;
