-- Diagnostica gastos que apuntan a un family_member sin linked_user_id
-- (normalmente el slot placeholder "Pareja").
--
-- Este script NO modifica datos.
--
-- Lectura de resultados:
-- 1. Primer SELECT: resumen global.
-- 2. Segundo SELECT: resumen por pareja y si el repair automatico es seguro.
-- 3. Tercer SELECT: detalle gasto por gasto.
-- 4. Cuarto SELECT: preview de cambios que haria repair-expenses-unlinked-member.sql.

WITH invalid_expenses AS (
  SELECT
    e.id,
    e.couple_id,
    c.invite_code,
    e.owner_id,
    e.amount,
    e.date,
    e.description,
    e.split_method,
    e.paid_by,
    paid_member.name AS paid_by_name,
    paid_member.linked_user_id AS paid_by_linked_user_id,
    paid_profile.email AS paid_by_email,
    e.assigned_user_id,
    assigned_member.name AS assigned_user_name,
    assigned_member.linked_user_id AS assigned_user_linked_user_id,
    assigned_profile.email AS assigned_user_email,
    e.budget_id,
    e.batch_id,
    e.batch_name,
    e.is_recurring,
    e.recurrence_interval,
    e.recurrence_end_date
  FROM expenses e
  LEFT JOIN couples c ON c.id = e.couple_id
  JOIN family_members paid_member ON paid_member.id = e.paid_by
  LEFT JOIN profiles paid_profile ON paid_profile.id = paid_member.linked_user_id
  LEFT JOIN family_members assigned_member ON assigned_member.id = e.assigned_user_id
  LEFT JOIN profiles assigned_profile ON assigned_profile.id = assigned_member.linked_user_id
  WHERE paid_member.linked_user_id IS NULL
     OR (
       e.assigned_user_id IS NOT NULL
       AND assigned_member.linked_user_id IS NULL
     )
),
member_counts AS (
  SELECT
    fm.couple_id,
    count(*) FILTER (WHERE fm.linked_user_id IS NOT NULL) AS linked_members,
    count(*) FILTER (WHERE fm.linked_user_id IS NULL) AS unlinked_members
  FROM family_members fm
  WHERE fm.couple_id IN (
    SELECT DISTINCT couple_id
    FROM invalid_expenses
    WHERE couple_id IS NOT NULL
  )
  GROUP BY fm.couple_id
),
target_members AS (
  SELECT
    fm.couple_id,
    (array_agg(fm.id ORDER BY fm.created_at))[1] AS target_member_id,
    (array_agg(fm.name ORDER BY fm.created_at))[1] AS target_member_name,
    (array_agg(p.email ORDER BY fm.created_at))[1] AS target_member_email
  FROM family_members fm
  LEFT JOIN profiles p ON p.id = fm.linked_user_id
  WHERE fm.linked_user_id IS NOT NULL
  GROUP BY fm.couple_id
  HAVING count(*) = 1
),
classified AS (
  SELECT
    invalid_expenses.*,
    coalesce(member_counts.linked_members, 0) AS linked_members,
    coalesce(member_counts.unlinked_members, 0) AS unlinked_members,
    target_members.target_member_id,
    target_members.target_member_name,
    target_members.target_member_email,
    CASE
      WHEN coalesce(member_counts.linked_members, 0) = 1
        THEN 'repairable_by_script'
      ELSE 'manual_review'
    END AS repair_status,
    array_remove(ARRAY[
      CASE
        WHEN invalid_expenses.paid_by_linked_user_id IS NULL
          THEN 'paid_by_unlinked'
      END,
      CASE
        WHEN invalid_expenses.assigned_user_id IS NOT NULL
          AND invalid_expenses.assigned_user_linked_user_id IS NULL
          THEN 'assigned_user_id_unlinked'
      END,
      CASE
        WHEN invalid_expenses.split_method <> 'individual'
          THEN 'shared_expense_without_linked_partner'
      END
    ], NULL) AS issues
  FROM invalid_expenses
  LEFT JOIN member_counts ON member_counts.couple_id = invalid_expenses.couple_id
  LEFT JOIN target_members ON target_members.couple_id = invalid_expenses.couple_id
)
SELECT
  count(*) AS invalid_expenses,
  count(DISTINCT couple_id) AS affected_couples,
  count(*) FILTER (WHERE repair_status = 'repairable_by_script') AS repairable_expenses,
  count(DISTINCT couple_id) FILTER (
    WHERE repair_status = 'repairable_by_script'
  ) AS repairable_couples,
  count(*) FILTER (WHERE repair_status = 'manual_review') AS manual_review_expenses,
  count(DISTINCT couple_id) FILTER (
    WHERE repair_status = 'manual_review'
  ) AS manual_review_couples,
  count(*) FILTER (WHERE 'paid_by_unlinked' = ANY(issues)) AS paid_by_unlinked,
  count(*) FILTER (
    WHERE 'assigned_user_id_unlinked' = ANY(issues)
  ) AS assigned_user_id_unlinked,
  count(*) FILTER (
    WHERE 'shared_expense_without_linked_partner' = ANY(issues)
  ) AS shared_expenses_without_linked_partner
FROM classified;

WITH invalid_expenses AS (
  SELECT
    e.id,
    e.couple_id,
    c.invite_code,
    e.amount,
    e.date,
    e.description,
    e.split_method,
    e.paid_by,
    paid_member.linked_user_id AS paid_by_linked_user_id,
    e.assigned_user_id,
    assigned_member.linked_user_id AS assigned_user_linked_user_id
  FROM expenses e
  LEFT JOIN couples c ON c.id = e.couple_id
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
    count(*) FILTER (WHERE fm.linked_user_id IS NOT NULL) AS linked_members,
    count(*) FILTER (WHERE fm.linked_user_id IS NULL) AS unlinked_members
  FROM family_members fm
  WHERE fm.couple_id IN (
    SELECT DISTINCT couple_id
    FROM invalid_expenses
    WHERE couple_id IS NOT NULL
  )
  GROUP BY fm.couple_id
)
SELECT
  invalid_expenses.couple_id,
  invalid_expenses.invite_code,
  coalesce(member_counts.linked_members, 0) AS linked_members,
  coalesce(member_counts.unlinked_members, 0) AS unlinked_members,
  count(*) AS invalid_expenses,
  count(*) FILTER (WHERE invalid_expenses.paid_by_linked_user_id IS NULL) AS paid_by_unlinked,
  count(*) FILTER (
    WHERE invalid_expenses.assigned_user_id IS NOT NULL
      AND invalid_expenses.assigned_user_linked_user_id IS NULL
  ) AS assigned_user_id_unlinked,
  count(*) FILTER (
    WHERE invalid_expenses.split_method <> 'individual'
  ) AS shared_expenses_without_linked_partner,
  min(invalid_expenses.date) AS oldest_expense_date,
  max(invalid_expenses.date) AS newest_expense_date,
  CASE
    WHEN coalesce(member_counts.linked_members, 0) = 1
      THEN 'repairable_by_script'
    ELSE 'manual_review'
  END AS repair_status
FROM invalid_expenses
LEFT JOIN member_counts ON member_counts.couple_id = invalid_expenses.couple_id
GROUP BY
  invalid_expenses.couple_id,
  invalid_expenses.invite_code,
  member_counts.linked_members,
  member_counts.unlinked_members
ORDER BY invalid_expenses DESC, newest_expense_date DESC;

WITH invalid_expenses AS (
  SELECT
    e.id,
    e.couple_id,
    c.invite_code,
    e.owner_id,
    e.amount,
    e.date,
    e.description,
    e.split_method,
    e.paid_by,
    paid_member.name AS paid_by_name,
    paid_member.linked_user_id AS paid_by_linked_user_id,
    paid_profile.email AS paid_by_email,
    e.assigned_user_id,
    assigned_member.name AS assigned_user_name,
    assigned_member.linked_user_id AS assigned_user_linked_user_id,
    assigned_profile.email AS assigned_user_email,
    e.budget_id,
    e.batch_id,
    e.batch_name,
    e.is_recurring,
    e.recurrence_interval,
    e.recurrence_end_date
  FROM expenses e
  LEFT JOIN couples c ON c.id = e.couple_id
  JOIN family_members paid_member ON paid_member.id = e.paid_by
  LEFT JOIN profiles paid_profile ON paid_profile.id = paid_member.linked_user_id
  LEFT JOIN family_members assigned_member ON assigned_member.id = e.assigned_user_id
  LEFT JOIN profiles assigned_profile ON assigned_profile.id = assigned_member.linked_user_id
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
SELECT
  invalid_expenses.id AS expense_id,
  invalid_expenses.couple_id,
  invalid_expenses.invite_code,
  coalesce(member_counts.linked_members, 0) AS linked_members,
  CASE
    WHEN coalesce(member_counts.linked_members, 0) = 1
      THEN 'repairable_by_script'
    ELSE 'manual_review'
  END AS repair_status,
  array_remove(ARRAY[
    CASE
      WHEN invalid_expenses.paid_by_linked_user_id IS NULL
        THEN 'paid_by_unlinked'
    END,
    CASE
      WHEN invalid_expenses.assigned_user_id IS NOT NULL
        AND invalid_expenses.assigned_user_linked_user_id IS NULL
        THEN 'assigned_user_id_unlinked'
    END,
    CASE
      WHEN invalid_expenses.split_method <> 'individual'
        THEN 'shared_expense_without_linked_partner'
    END
  ], NULL) AS issues,
  invalid_expenses.date,
  invalid_expenses.description,
  invalid_expenses.amount,
  invalid_expenses.split_method,
  invalid_expenses.paid_by,
  invalid_expenses.paid_by_name,
  invalid_expenses.paid_by_email,
  invalid_expenses.assigned_user_id,
  invalid_expenses.assigned_user_name,
  invalid_expenses.assigned_user_email,
  invalid_expenses.budget_id,
  invalid_expenses.batch_id,
  invalid_expenses.batch_name,
  invalid_expenses.is_recurring,
  invalid_expenses.recurrence_interval,
  invalid_expenses.recurrence_end_date
FROM invalid_expenses
LEFT JOIN member_counts ON member_counts.couple_id = invalid_expenses.couple_id
ORDER BY invalid_expenses.date DESC, invalid_expenses.id;

WITH invalid_expenses AS (
  SELECT
    e.id,
    e.couple_id,
    e.split_method,
    e.paid_by,
    paid_member.linked_user_id AS paid_by_linked_user_id,
    e.assigned_user_id,
    assigned_member.linked_user_id AS assigned_user_linked_user_id
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
    (array_agg(fm.id ORDER BY fm.created_at))[1] AS target_member_id,
    (array_agg(fm.name ORDER BY fm.created_at))[1] AS target_member_name,
    (array_agg(p.email ORDER BY fm.created_at))[1] AS target_member_email
  FROM family_members fm
  LEFT JOIN profiles p ON p.id = fm.linked_user_id
  WHERE fm.linked_user_id IS NOT NULL
  GROUP BY fm.couple_id
  HAVING count(*) = 1
)
SELECT
  invalid_expenses.id AS expense_id,
  invalid_expenses.couple_id,
  target_members.target_member_id,
  target_members.target_member_name,
  target_members.target_member_email,
  invalid_expenses.split_method AS current_split_method,
  CASE
    WHEN invalid_expenses.split_method <> 'individual'
      THEN 'individual'
    ELSE invalid_expenses.split_method
  END AS proposed_split_method,
  invalid_expenses.paid_by AS current_paid_by,
  CASE
    WHEN invalid_expenses.paid_by_linked_user_id IS NULL
      THEN target_members.target_member_id
    ELSE invalid_expenses.paid_by
  END AS proposed_paid_by,
  invalid_expenses.assigned_user_id AS current_assigned_user_id,
  CASE
    WHEN invalid_expenses.split_method <> 'individual'
      THEN target_members.target_member_id
    WHEN invalid_expenses.assigned_user_id IS NOT NULL
      AND invalid_expenses.assigned_user_linked_user_id IS NULL
      THEN target_members.target_member_id
    ELSE invalid_expenses.assigned_user_id
  END AS proposed_assigned_user_id
FROM invalid_expenses
JOIN target_members ON target_members.couple_id = invalid_expenses.couple_id
ORDER BY invalid_expenses.couple_id, invalid_expenses.id;
