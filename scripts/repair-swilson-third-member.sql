-- Repara el caso accidental donde swilson.t@gmail.com quedo como tercer
-- integrante de la pareja creada con swilsont@gmail.com y s.wilsont@gmail.com.
--
-- Seguridad:
-- - Valida IDs y correos exactos antes de tocar datos.
-- - Migra los movimientos financieros propios del tercer usuario.
-- - Aborta si algun movimiento cruza a los otros miembros o usa presupuesto.
-- - Mantiene la pareja original con los dos primeros usuarios.
-- - Mueve el tercer usuario a una pareja nueva con su propio codigo.
--
-- Ejecutar dentro de la base de datos antes de aplicar la migracion que agrega
-- idx_family_members_linked_user_unique si aun hay data corrupta.

BEGIN;

CREATE TEMP TABLE IF NOT EXISTS repair_swilson_result (
  moved_user_email text NOT NULL,
  original_couple_id uuid NOT NULL,
  new_couple_id uuid NOT NULL,
  new_invite_code text NOT NULL,
  moved_expenses integer NOT NULL,
  moved_incomes integer NOT NULL,
  moved_deductions integer NOT NULL
);

TRUNCATE repair_swilson_result;

DO $$
DECLARE
  original_couple_id uuid;
  new_couple_id uuid;
  new_invite_code text;
  third_member_id CONSTANT uuid := '5712d65d-51c7-4eb9-a502-65d72d00ae70';
  third_user_id CONSTANT uuid := 'cefee75c-ca12-4e00-ad9a-8c9aa5cb1c0a';
  third_member_name text;
  linked_count integer;
  expense_refs integer;
  income_refs integer;
  deduction_refs integer;
  expense_cross_refs integer;
  expense_owner_refs integer;
  expense_budget_refs integer;
  expense_batch_cross_refs integer;
BEGIN
  SELECT fm.couple_id, fm.name
  INTO original_couple_id, third_member_name
  FROM family_members fm
  JOIN profiles p ON p.id = fm.linked_user_id
  WHERE fm.id = third_member_id
    AND fm.linked_user_id = third_user_id
    AND p.email = 'swilson.t@gmail.com';

  IF original_couple_id IS NULL THEN
    RAISE EXCEPTION 'No se encontro el tercer miembro esperado o no coincide su correo/user_id.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM family_members fm
    JOIN profiles p ON p.id = fm.linked_user_id
    WHERE fm.id = 'd5b9d80e-0c92-4c6a-b254-9de22e5505f6'
      AND fm.couple_id = original_couple_id
      AND p.email = 'swilsont@gmail.com'
  ) THEN
    RAISE EXCEPTION 'No se encontro el primer miembro esperado en la misma pareja.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM family_members fm
    JOIN profiles p ON p.id = fm.linked_user_id
    WHERE fm.id = '7bbdb9c6-13b9-4b2d-82e8-96a373eb1197'
      AND fm.couple_id = original_couple_id
      AND p.email = 's.wilsont@gmail.com'
  ) THEN
    RAISE EXCEPTION 'No se encontro el segundo miembro esperado en la misma pareja.';
  END IF;

  SELECT count(*) FILTER (WHERE linked_user_id IS NOT NULL)
  INTO linked_count
  FROM family_members
  WHERE couple_id = original_couple_id;

  IF linked_count <> 3 THEN
    RAISE EXCEPTION 'La pareja original tiene % miembros vinculados, no 3. Abortando.', linked_count;
  END IF;

  SELECT count(*)
  INTO expense_refs
  FROM expenses
  WHERE paid_by = third_member_id
     OR assigned_user_id = third_member_id;

  SELECT count(*)
  INTO income_refs
  FROM incomes
  WHERE user_id = third_member_id;

  SELECT count(*)
  INTO deduction_refs
  FROM deductions
  WHERE user_id = third_member_id;

  SELECT count(*)
  INTO expense_cross_refs
  FROM expenses
  WHERE (paid_by = third_member_id OR assigned_user_id = third_member_id)
    AND (
      paid_by <> third_member_id
      OR (
        assigned_user_id IS NOT NULL
        AND assigned_user_id <> third_member_id
      )
    );

  IF expense_cross_refs > 0 THEN
    RAISE EXCEPTION
      'Hay % gastos cruzados con otros miembros. Requiere revisar paid_by/assigned_user_id antes de migrar.',
      expense_cross_refs;
  END IF;

  SELECT count(*)
  INTO expense_owner_refs
  FROM expenses
  WHERE (paid_by = third_member_id OR assigned_user_id = third_member_id)
    AND owner_id <> third_user_id;

  IF expense_owner_refs > 0 THEN
    RAISE EXCEPTION
      'Hay % gastos del tercer miembro creados por otro owner_id. Requiere revision manual.',
      expense_owner_refs;
  END IF;

  SELECT count(*)
  INTO expense_budget_refs
  FROM expenses
  WHERE (paid_by = third_member_id OR assigned_user_id = third_member_id)
    AND budget_id IS NOT NULL;

  IF expense_budget_refs > 0 THEN
    RAISE EXCEPTION
      'Hay % gastos del tercer miembro con budget_id. Requiere mover/limpiar presupuesto manualmente.',
      expense_budget_refs;
  END IF;

  SELECT count(*)
  INTO expense_batch_cross_refs
  FROM expenses moved_expense
  WHERE (moved_expense.paid_by = third_member_id OR moved_expense.assigned_user_id = third_member_id)
    AND moved_expense.batch_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM expenses sibling_expense
      WHERE sibling_expense.batch_id = moved_expense.batch_id
        AND sibling_expense.id <> moved_expense.id
        AND sibling_expense.couple_id = original_couple_id
        AND NOT (
          sibling_expense.paid_by = third_member_id
          OR sibling_expense.assigned_user_id = third_member_id
        )
    );

  IF expense_batch_cross_refs > 0 THEN
    RAISE EXCEPTION
      'Hay % gastos del tercer miembro en batches compartidos con la pareja original. Requiere revision manual.',
      expense_batch_cross_refs;
  END IF;

  LOOP
    new_invite_code := upper(substring(md5(random()::text || clock_timestamp()::text), 1, 6));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM couples WHERE invite_code = new_invite_code
    );
  END LOOP;

  INSERT INTO couples (invite_code)
  VALUES (new_invite_code)
  RETURNING id INTO new_couple_id;

  UPDATE profiles
  SET couple_id = new_couple_id
  WHERE id = third_user_id;

  UPDATE family_members
  SET
    couple_id = new_couple_id,
    owner_id = third_user_id,
    linked_user_id = third_user_id,
    name = coalesce(nullif(third_member_name, ''), 'Sebon')
  WHERE id = third_member_id;

  INSERT INTO family_members (owner_id, couple_id, name, linked_user_id)
  VALUES (third_user_id, new_couple_id, 'Pareja', NULL);

  UPDATE expenses
  SET couple_id = new_couple_id
  WHERE paid_by = third_member_id
     OR assigned_user_id = third_member_id;

  UPDATE incomes
  SET couple_id = new_couple_id
  WHERE user_id = third_member_id;

  UPDATE deductions
  SET couple_id = new_couple_id
  WHERE user_id = third_member_id;

  SELECT count(*) FILTER (WHERE linked_user_id IS NOT NULL)
  INTO linked_count
  FROM family_members
  WHERE couple_id = original_couple_id;

  IF linked_count <> 2 THEN
    RAISE EXCEPTION 'La pareja original quedo con % miembros vinculados, no 2. Abortando.', linked_count;
  END IF;

  INSERT INTO repair_swilson_result (
    moved_user_email,
    original_couple_id,
    new_couple_id,
    new_invite_code,
    moved_expenses,
    moved_incomes,
    moved_deductions
  )
  VALUES (
    'swilson.t@gmail.com',
    original_couple_id,
    new_couple_id,
    new_invite_code,
    expense_refs,
    income_refs,
    deduction_refs
  );
END $$;

COMMIT;

SELECT *
FROM repair_swilson_result;
