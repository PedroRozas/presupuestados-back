-- Repara gastos historicos que quedaron apuntando a un family_member sin
-- linked_user_id, por ejemplo el slot placeholder "Pareja".
--
-- Regla de seguridad:
-- - Solo repara parejas con exactamente 1 miembro vinculado.
-- - Si el gasto era compartido pero la pareja no esta vinculada, lo convierte
--   a individual y lo asigna al unico miembro real.
-- - Si hay casos ambiguos, no repara nada y los muestra al final.
--
-- Uso:
-- 1. Ejecuta el script completo en Supabase SQL Editor.
-- 2. Si termina OK, revisa el SELECT final repair_expenses_unlinked_member_result.
-- 3. Si blocker_count > 0, no se reparo nada; revisa el segundo SELECT final.

BEGIN;

CREATE TEMP TABLE IF NOT EXISTS repair_expenses_unlinked_member_result (
  repaired_expense_id uuid NOT NULL,
  couple_id uuid,
  original_split_method text NOT NULL,
  new_split_method text NOT NULL,
  original_paid_by uuid NOT NULL,
  new_paid_by uuid NOT NULL,
  original_assigned_user_id uuid,
  new_assigned_user_id uuid,
  description text NOT NULL,
  amount numeric NOT NULL,
  expense_date timestamptz NOT NULL
);

CREATE TEMP TABLE IF NOT EXISTS repair_expenses_unlinked_member_blockers (
  couple_id uuid,
  invite_code text,
  linked_members integer NOT NULL,
  invalid_expenses integer NOT NULL,
  invalid_paid_by_ids uuid[],
  invalid_assigned_user_ids uuid[]
);

TRUNCATE repair_expenses_unlinked_member_result;
TRUNCATE repair_expenses_unlinked_member_blockers;

DO $$
DECLARE
  blocker_count integer;
BEGIN
  WITH invalid_expenses AS (
    SELECT
      e.id,
      e.couple_id,
      e.paid_by,
      e.assigned_user_id,
      paid_member.linked_user_id AS paid_linked_user_id,
      assigned_member.linked_user_id AS assigned_linked_user_id
    FROM expenses e
    JOIN family_members paid_member ON paid_member.id = e.paid_by
    LEFT JOIN family_members assigned_member ON assigned_member.id = e.assigned_user_id
    WHERE paid_member.linked_user_id IS NULL
       OR (
         e.assigned_user_id IS NOT NULL
         AND assigned_member.linked_user_id IS NULL
       )
  ),
  member_counts AS (
    SELECT
      fm.couple_id,
      count(*) FILTER (WHERE fm.linked_user_id IS NOT NULL) AS linked_members
    FROM family_members fm
    WHERE fm.couple_id IN (
      SELECT DISTINCT couple_id
      FROM invalid_expenses
      WHERE couple_id IS NOT NULL
    )
    GROUP BY fm.couple_id
  )
  INSERT INTO repair_expenses_unlinked_member_blockers (
    couple_id,
    invite_code,
    linked_members,
    invalid_expenses,
    invalid_paid_by_ids,
    invalid_assigned_user_ids
  )
  SELECT
    invalid_expenses.couple_id,
    couples.invite_code,
    coalesce(member_counts.linked_members, 0) AS linked_members,
    count(*) AS invalid_expenses,
    array_remove(array_agg(DISTINCT invalid_expenses.paid_by)
      FILTER (WHERE invalid_expenses.paid_linked_user_id IS NULL), NULL),
    array_remove(array_agg(DISTINCT invalid_expenses.assigned_user_id)
      FILTER (WHERE invalid_expenses.assigned_user_id IS NOT NULL
        AND invalid_expenses.assigned_linked_user_id IS NULL), NULL)
  FROM invalid_expenses
  LEFT JOIN member_counts ON member_counts.couple_id = invalid_expenses.couple_id
  LEFT JOIN couples ON couples.id = invalid_expenses.couple_id
  GROUP BY
    invalid_expenses.couple_id,
    couples.invite_code,
    member_counts.linked_members
  HAVING coalesce(member_counts.linked_members, 0) <> 1;

  SELECT count(*)
  INTO blocker_count
  FROM repair_expenses_unlinked_member_blockers;

  IF blocker_count = 0 THEN
    WITH invalid_expenses AS (
      SELECT
        e.id,
        e.couple_id,
        e.split_method,
        e.paid_by,
        e.assigned_user_id,
        e.description,
        e.amount,
        e.date,
        paid_member.linked_user_id AS paid_linked_user_id,
        assigned_member.linked_user_id AS assigned_linked_user_id
      FROM expenses e
      JOIN family_members paid_member ON paid_member.id = e.paid_by
      LEFT JOIN family_members assigned_member ON assigned_member.id = e.assigned_user_id
      WHERE paid_member.linked_user_id IS NULL
         OR (
           e.assigned_user_id IS NOT NULL
           AND assigned_member.linked_user_id IS NULL
         )
    ),
    target_members AS (
      SELECT
        fm.couple_id,
        (array_agg(fm.id ORDER BY fm.created_at))[1] AS target_member_id
      FROM family_members fm
      WHERE fm.linked_user_id IS NOT NULL
      GROUP BY fm.couple_id
      HAVING count(*) = 1
    ),
    repaired AS (
      UPDATE expenses e
      SET
        paid_by = CASE
          WHEN invalid_expenses.paid_linked_user_id IS NULL
            THEN target_members.target_member_id
          ELSE e.paid_by
        END,
        assigned_user_id = CASE
          WHEN e.split_method <> 'individual'
            THEN target_members.target_member_id
          WHEN invalid_expenses.assigned_user_id IS NULL
            THEN NULL
          WHEN invalid_expenses.assigned_linked_user_id IS NULL
            THEN target_members.target_member_id
          ELSE e.assigned_user_id
        END,
        split_method = CASE
          WHEN e.split_method <> 'individual'
            THEN 'individual'
          ELSE e.split_method
        END
      FROM invalid_expenses
      JOIN target_members ON target_members.couple_id = invalid_expenses.couple_id
      WHERE e.id = invalid_expenses.id
      RETURNING
        e.id,
        e.couple_id,
        invalid_expenses.split_method AS original_split_method,
        e.split_method AS new_split_method,
        invalid_expenses.paid_by AS original_paid_by,
        e.paid_by AS new_paid_by,
        invalid_expenses.assigned_user_id AS original_assigned_user_id,
        e.assigned_user_id AS new_assigned_user_id,
        e.description,
        e.amount,
        e.date
    )
    INSERT INTO repair_expenses_unlinked_member_result (
      repaired_expense_id,
      couple_id,
      original_split_method,
      new_split_method,
      original_paid_by,
      new_paid_by,
      original_assigned_user_id,
      new_assigned_user_id,
      description,
      amount,
      expense_date
    )
    SELECT
      id,
      couple_id,
      original_split_method,
      new_split_method,
      original_paid_by,
      new_paid_by,
      original_assigned_user_id,
      new_assigned_user_id,
      description,
      amount,
      date
    FROM repaired;
  END IF;
END $$;

COMMIT;

SELECT
  (SELECT count(*) FROM repair_expenses_unlinked_member_blockers) AS blocker_count,
  count(*) AS repaired_expenses,
  count(*) FILTER (WHERE original_paid_by <> new_paid_by) AS repaired_paid_by,
  count(*) FILTER (
    WHERE original_assigned_user_id IS DISTINCT FROM new_assigned_user_id
  ) AS repaired_assigned_user_id,
  count(*) FILTER (WHERE original_split_method <> new_split_method) AS converted_to_individual
FROM repair_expenses_unlinked_member_result;

SELECT *
FROM repair_expenses_unlinked_member_blockers
ORDER BY invalid_expenses DESC, couple_id;

SELECT *
FROM repair_expenses_unlinked_member_result
ORDER BY expense_date DESC, repaired_expense_id;
