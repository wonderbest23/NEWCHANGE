CREATE POLICY "no client access passkey_challenges"
  ON public.passkey_challenges
  AS PERMISSIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);