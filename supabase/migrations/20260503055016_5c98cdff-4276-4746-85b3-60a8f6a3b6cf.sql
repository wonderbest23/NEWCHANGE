-- Helper: 호출자가 해당 가족의 시니어 멤버인지 확인
CREATE OR REPLACE FUNCTION public.is_senior_of_family(_family_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_id = _family_id
      AND user_id = auth.uid()
      AND role IN ('primary_senior', 'senior')
  )
$$;

-- care_recipients: SELECT는 모든 가족 멤버, WRITE는 시니어만
DROP POLICY IF EXISTS care_recipients_modify ON public.care_recipients;
DROP POLICY IF EXISTS care_recipients_select ON public.care_recipients;

CREATE POLICY care_recipients_select ON public.care_recipients
  FOR SELECT TO authenticated
  USING (family_id IN (SELECT user_family_ids()));

CREATE POLICY care_recipients_insert ON public.care_recipients
  FOR INSERT TO authenticated
  WITH CHECK (public.is_senior_of_family(family_id));

CREATE POLICY care_recipients_update ON public.care_recipients
  FOR UPDATE TO authenticated
  USING (public.is_senior_of_family(family_id))
  WITH CHECK (public.is_senior_of_family(family_id));

CREATE POLICY care_recipients_delete ON public.care_recipients
  FOR DELETE TO authenticated
  USING (public.is_senior_of_family(family_id));

-- medication_schedules: SELECT 가족 전체, WRITE는 시니어만
DROP POLICY IF EXISTS med_schedules_all ON public.medication_schedules;

CREATE POLICY med_schedules_select ON public.medication_schedules
  FOR SELECT TO authenticated
  USING (can_access_recipient(care_recipient_id));

CREATE POLICY med_schedules_write ON public.medication_schedules
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.care_recipients r
      WHERE r.id = medication_schedules.care_recipient_id
        AND public.is_senior_of_family(r.family_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.care_recipients r
      WHERE r.id = medication_schedules.care_recipient_id
        AND public.is_senior_of_family(r.family_id)
    )
  );

-- conditions: SELECT 가족 전체, WRITE는 시니어만
DROP POLICY IF EXISTS conditions_all ON public.conditions;

CREATE POLICY conditions_select ON public.conditions
  FOR SELECT TO authenticated
  USING (can_access_recipient(care_recipient_id));

CREATE POLICY conditions_write ON public.conditions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.care_recipients r
      WHERE r.id = conditions.care_recipient_id
        AND public.is_senior_of_family(r.family_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.care_recipients r
      WHERE r.id = conditions.care_recipient_id
        AND public.is_senior_of_family(r.family_id)
    )
  );