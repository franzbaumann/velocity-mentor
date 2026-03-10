-- Grant SELECT on oauth_connections view to authenticated users
-- The view uses security_invoker=on so RLS on oauth_tokens applies automatically.
-- The existing SELECT policy "Users can see own token metadata" covers this.
-- This migration is a no-op guard to document the intent.

-- Ensure authenticated role can query the view
GRANT SELECT ON public.oauth_connections TO authenticated;
