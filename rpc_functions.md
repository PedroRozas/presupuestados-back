accept_partner_invite_rpc 

DECLARE
    v_user_id UUID := auth.uid();
    v_request RECORD;
    v_sender_couple_id UUID;
    v_user_name TEXT;
    v_member_slot_id UUID;
BEGIN
    -- 1. Obtener datos de la solicitud
    SELECT * INTO v_request 
    FROM partner_requests 
    WHERE id = p_request_id AND status = 'pending';

    IF v_request IS NULL THEN
        RAISE EXCEPTION 'Invitación no encontrada o ya procesada';
    END IF;

    -- 2. Obtener couple_id del remitente
    SELECT couple_id INTO v_sender_couple_id 
    FROM profiles 
    WHERE id = v_request.sender_id;

    IF v_sender_couple_id IS NULL THEN
        RAISE EXCEPTION 'El usuario que invita no tiene un grupo familiar activo';
    END IF;

    -- 3. Obtener nombre del usuario actual
    SELECT coalesce(full_name, 'Usuario') INTO v_user_name 
    FROM profiles 
    WHERE id = v_user_id;

    -- 4. Actualizar perfil del usuario actual para unirse al grupo
    UPDATE profiles 
    SET couple_id = v_sender_couple_id 
    WHERE id = v_user_id;

    -- 5. Marcar solicitud como aceptada
    UPDATE partner_requests 
    SET status = 'accepted', receiver_id = v_user_id
    WHERE id = p_request_id;

    -- 6. Lógica de Miembros de Familia (Slot vacío o nuevo)
    SELECT id INTO v_member_slot_id
    FROM family_members
    WHERE couple_id = v_sender_couple_id 
      AND linked_user_id IS NULL 
      AND name != 'Yo' -- Evitar tomar el slot del dueño si por error estuviera null
    LIMIT 1;

    IF v_member_slot_id IS NOT NULL THEN
        UPDATE family_members
        SET linked_user_id = v_user_id,
            name = coalesce(v_user_name, 'Pareja')
        WHERE id = v_member_slot_id;
    ELSE
        INSERT INTO family_members (owner_id, couple_id, name, linked_user_id)
        VALUES (v_request.sender_id, v_sender_couple_id, coalesce(v_user_name, 'Pareja'), v_user_id);
    END IF;

    RETURN TRUE;
END;

add_expense_rpc 


DECLARE
    v_couple_id uuid;
    v_auth_user_id uuid;
BEGIN
    v_auth_user_id := auth.uid();
    IF v_auth_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT couple_id INTO v_couple_id
    FROM public.profiles
    WHERE id = v_auth_user_id;

    IF v_couple_id IS NULL THEN
        RAISE EXCEPTION 'User does not belong to a couple';
    END IF;

    IF p_budget_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.budgets 
            WHERE id = p_budget_id AND couple_id = v_couple_id
        ) THEN
             RAISE EXCEPTION 'Budget does not belong to this couple';
        END IF;
    END IF;

    INSERT INTO public.expenses (
        id, amount, date, description, is_recurring, recurrence_interval,
        recurrence_end_date, split_method, paid_by, assigned_user_id,
        budget_id, couple_id, owner_id, batch_id, batch_name, is_credit, category_id
    ) VALUES (
        p_expense_id, p_amount, p_date, p_description, p_is_recurring, p_recurrence_interval,
        p_recurrence_end_date, p_split_method, p_paid_by, p_assigned_user_id,
        p_budget_id, v_couple_id, v_auth_user_id, p_batch_id, p_batch_name, p_is_credit, p_category_id
    );
END;


create_budget_rpc

DECLARE
  v_user_id UUID;
  v_couple_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Obtener couple_id del usuario
  SELECT couple_id INTO v_couple_id
  FROM profiles
  WHERE id = v_user_id;

  IF v_couple_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no pertenece a una pareja';
  END IF;

  -- Validar que el tipo sea válido
  IF p_type NOT IN ('joint', 'individual') THEN
    RAISE EXCEPTION 'Tipo de presupuesto inválido';
  END IF;

  -- Si es individual, debe tener user_id
  IF p_type = 'individual' AND p_user_id IS NULL THEN
    RAISE EXCEPTION 'Presupuestos individuales requieren user_id';
  END IF;

  -- Insertar presupuesto
  INSERT INTO budgets (
    id, couple_id, owner_id, name, type, "limit", 
    user_id, associated_card, default_split_method
  ) VALUES (
    p_budget_id, v_couple_id, v_user_id, p_name, p_type, p_limit,
    p_user_id, p_associated_card, p_default_split_method
  );
END;

delete_budget_rpc


DECLARE
  v_couple_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Verificar que el usuario tenga acceso al budget
  SELECT couple_id INTO v_couple_id
  FROM budgets
  WHERE id = p_budget_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Presupuesto no encontrado';
  END IF;

  -- Verificar que el usuario pertenece a la pareja
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = v_user_id AND couple_id = v_couple_id
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para eliminar este presupuesto';
  END IF;

  -- Desvincular gastos (importante para integridad)
  UPDATE expenses
  SET budget_id = NULL
  WHERE budget_id = p_budget_id;

  -- Eliminar presupuesto
  DELETE FROM budgets WHERE id = p_budget_id;
END;


delete_expenses_batch_rpc


DECLARE
  v_couple_id UUID;
BEGIN
  -- Obtener couple_id del usuario
  SELECT couple_id INTO v_couple_id
  FROM profiles
  WHERE id = auth.uid();

  -- Eliminar gastos que coincidan con los IDs y pertenezcan a la pareja
  DELETE FROM expenses 
  WHERE id = ANY(p_expense_ids) AND couple_id = v_couple_id;
END;


get_auth_couple_id

  select couple_id from public.profiles where id = auth.uid() limit 1;

  get_budgets_rpc


DECLARE
  v_couple_id UUID;
BEGIN
  -- Obtener couple_id del usuario
  SELECT couple_id INTO v_couple_id 
  FROM profiles 
  WHERE id = auth.uid();
  
  IF v_couple_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    b.id,
    b.name,
    b.type,
    b.limit,
    b.associated_card,
    b.default_split_method,
    b.user_id,
    b.couple_id,
    b.owner_id,
    b.created_at
  FROM budgets b
  WHERE b.couple_id = v_couple_id;
END;


get_categories_rpc


DECLARE
    v_categories json;
BEGIN
    SELECT json_agg(row_to_json(c)) INTO v_categories
    FROM (
        SELECT id, name
        FROM public.expense_categories
        ORDER BY id ASC
    ) c;

    RETURN COALESCE(v_categories, '[]'::json);
END;

get_couple_id_rpc


  SELECT couple_id 
  FROM profiles 
  WHERE id = auth.uid();
get_current_user_profile


  select *
  from profiles
  where id = auth.uid();


  get_dashboard_data


DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'members', COALESCE((SELECT json_agg(t) FROM (SELECT * FROM family_members WHERE couple_id = p_couple_id) t), '[]'::json),
        'incomes', COALESCE((SELECT json_agg(t) FROM (SELECT * FROM incomes WHERE couple_id = p_couple_id) t), '[]'::json),
        'deductions', COALESCE((SELECT json_agg(t) FROM (SELECT * FROM deductions WHERE couple_id = p_couple_id) t), '[]'::json),
        'budgets', COALESCE((SELECT json_agg(t) FROM (SELECT * FROM budgets WHERE couple_id = p_couple_id) t), '[]'::json),
        'expenses', COALESCE((SELECT json_agg(t) FROM (SELECT * FROM expenses WHERE couple_id = p_couple_id ORDER BY date DESC) t), '[]'::json)
    ) INTO result;
    
    RETURN result;
END;


get_deductions_rpc


DECLARE
  v_couple_id UUID;
BEGIN
  -- Obtener couple_id del usuario
  SELECT couple_id INTO v_couple_id 
  FROM profiles 
  WHERE id = auth.uid();
  
  IF v_couple_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    d.id,
    d.user_id,
    d.amount,
    d.date,
    d.description,
    d.couple_id,
    d.created_at
  FROM deductions d
  WHERE d.couple_id = v_couple_id;
END;


get_family_members_rpc


DECLARE
  v_couple_id UUID;
BEGIN
  -- Obtener couple_id
  SELECT couple_id INTO v_couple_id FROM profiles WHERE id = auth.uid();
  
  IF v_couple_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT * 
  FROM family_members 
  WHERE couple_id = v_couple_id;
END;


get_household_ids_rpc


DECLARE
  v_couple_id UUID;
BEGIN
  SELECT couple_id INTO v_couple_id FROM profiles WHERE id = auth.uid();

  IF v_couple_id IS NULL THEN
    -- Si no tiene pareja, retorna solo su propio ID
    RETURN QUERY SELECT auth.uid();
  ELSE
    -- Si tiene pareja, retorna los IDs de todos los perfiles en la pareja
    RETURN QUERY 
    SELECT id 
    FROM profiles 
    WHERE couple_id = v_couple_id;
  END IF;
END;


get_incomes_rpc

DECLARE
  v_couple_id UUID;
BEGIN
  -- Obtener couple_id del usuario
  SELECT couple_id INTO v_couple_id 
  FROM profiles 
  WHERE id = auth.uid();
  
  IF v_couple_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    i.id,
    i.user_id,
    i.amount,
    i.date,
    i.description,
    i.couple_id,
    i.created_at
  FROM incomes i
  WHERE i.couple_id = v_couple_id;
END;


get_linked_partner_email_rpc


DECLARE
  v_couple_id UUID;
  v_partner_email TEXT;
BEGIN
  SELECT couple_id INTO v_couple_id FROM profiles WHERE id = auth.uid();
  
  IF v_couple_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT email INTO v_partner_email
  FROM profiles
  WHERE couple_id = v_couple_id AND id != auth.uid()
  LIMIT 1;

  RETURN v_partner_email;
END;

	get_pending_invites_rpc


BEGIN
  RETURN QUERY
  SELECT 
    pr.id,
    pr.sender_id,
    pr.receiver_email,
    pr.status,
    pr.created_at,
    p.email as sender_email
  FROM partner_requests pr
  JOIN profiles p ON pr.sender_id = p.id
  WHERE pr.receiver_email = (SELECT email FROM profiles WHERE id = auth.uid())
    AND pr.status = 'pending';
END;


initialize_user_data


DECLARE
  v_user_id UUID := auth.uid();
  v_couple_id UUID;
  v_invite_code TEXT;
  v_existing_couple_id UUID;
  v_member_slot_id UUID;
BEGIN
  -- 1. Insertar o Actualizar Perfil
  INSERT INTO profiles (id, email, full_name)
  VALUES (v_user_id, p_email, p_full_name)
  ON CONFLICT (id) DO UPDATE
  SET full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), profiles.full_name);

  -- 2. Verificar si ya tiene pareja
  SELECT couple_id INTO v_couple_id FROM profiles WHERE id = v_user_id;

  -- 3. Lógica de Pareja (Si no tiene)
  IF v_couple_id IS NULL THEN
      -- A. Intentar unirse por código si se proveyó
      IF p_invite_code IS NOT NULL AND p_invite_code != '' THEN
          SELECT id, invite_code INTO v_existing_couple_id, v_invite_code
          FROM couples 
          WHERE upper(invite_code) = upper(p_invite_code);

          IF v_existing_couple_id IS NOT NULL THEN
              v_couple_id := v_existing_couple_id;
          END IF;
      END IF;

      -- B. Si aun es null (código inválido o no provisto), Crear Nueva Pareja
      IF v_couple_id IS NULL THEN
          v_invite_code := upper(substring(md5(random()::text), 1, 6));
          
          INSERT INTO couples (invite_code) VALUES (v_invite_code) 
          RETURNING id INTO v_couple_id;
          
          -- Crear placeholder para la futura pareja
          INSERT INTO family_members (owner_id, couple_id, name, linked_user_id)
          VALUES (v_user_id, v_couple_id, 'Pareja', NULL);
      ELSE
          -- Si nos unimos a una existente, recuperamos el código
          SELECT invite_code INTO v_invite_code FROM couples WHERE id = v_couple_id;
      END IF;

      -- Vincular perfil a la pareja
      UPDATE profiles SET couple_id = v_couple_id WHERE id = v_user_id;
  ELSE
      -- Ya tenía pareja, solo obtener el código
      SELECT invite_code INTO v_invite_code FROM couples WHERE id = v_couple_id;
  END IF;

  -- 4. Lógica de Miembros de Familia (Asegurar que existo en la lista)
  -- Buscar si ya estoy vinculado
  SELECT id INTO v_member_slot_id FROM family_members 
  WHERE couple_id = v_couple_id AND linked_user_id = v_user_id;

  IF v_member_slot_id IS NULL THEN
      -- Si no estoy, buscar un slot vacío (creado por mi pareja esperando por mi)
      SELECT id INTO v_member_slot_id FROM family_members 
      WHERE couple_id = v_couple_id AND linked_user_id IS NULL LIMIT 1;
      
      IF v_member_slot_id IS NOT NULL THEN
          -- Ocupar el slot vacío
          UPDATE family_members SET linked_user_id = v_user_id, name = p_full_name 
          WHERE id = v_member_slot_id;
      ELSE
          -- Si no hay slot vacío, crear uno nuevo
          INSERT INTO family_members (owner_id, couple_id, name, linked_user_id)
          VALUES (v_user_id, v_couple_id, p_full_name, v_user_id);
      END IF;
  ELSE
      -- Si ya existo, actualizar nombre por si acaso
      UPDATE family_members SET name = p_full_name WHERE id = v_member_slot_id;
  END IF;

  RETURN json_build_object('coupleId', v_couple_id, 'inviteCode', v_invite_code);
END;


is_user_premium


  SELECT COALESCE(is_premium, false)
  FROM profiles
  WHERE id = user_id;


  join_couple_by_code


DECLARE
    v_user_id UUID := auth.uid();
    v_couple_id UUID;
    v_user_name TEXT;
    v_member_slot_id UUID;
BEGIN
    -- 1. Buscar la pareja por código (ignorando mayúsculas/minúsculas)
    SELECT id INTO v_couple_id 
    FROM couples 
    WHERE upper(invite_code) = upper(p_code);

    IF v_couple_id IS NULL THEN
        RAISE EXCEPTION 'Código de invitación inválido';
    END IF;

    -- 2. Obtener nombre del usuario actual (desde metadata o perfil)
    SELECT coalesce(full_name, 'Usuario') INTO v_user_name 
    FROM profiles 
    WHERE id = v_user_id;

    -- 3. Actualizar perfil del usuario
    UPDATE profiles 
    SET couple_id = v_couple_id 
    WHERE id = v_user_id;

    -- 4. Lógica de Miembros de Familia (Slot vacío o nuevo)
    -- Buscar un slot vacío (alguien creado como "Pareja" pero sin linked_user_id)
    SELECT id INTO v_member_slot_id
    FROM family_members
    WHERE couple_id = v_couple_id AND linked_user_id IS NULL
    LIMIT 1;

    IF v_member_slot_id IS NOT NULL THEN
        -- Ocupar el slot existente
        UPDATE family_members
        SET linked_user_id = v_user_id,
            name = coalesce(v_user_name, 'Pareja (Unida)')
        WHERE id = v_member_slot_id;
    ELSE
        -- Crear nuevo miembro si no hay slot
        INSERT INTO family_members (owner_id, couple_id, name, linked_user_id)
        VALUES (v_user_id, v_couple_id, coalesce(v_user_name, 'Pareja (Unida)'), v_user_id);
    END IF;

    RETURN TRUE;
END;


log_premium_change


BEGIN
  IF OLD.is_premium IS DISTINCT FROM NEW.is_premium THEN
    INSERT INTO premium_audit_log (user_id, old_value, new_value, changed_by)
    VALUES (NEW.id, OLD.is_premium, NEW.is_premium, auth.uid());
  END IF;
  RETURN NEW;
END;


rls_auto_enable


DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;

send_partner_invite_rpc


DECLARE
  v_sender_id UUID;
BEGIN
  v_sender_id := auth.uid();

  -- Validar email
  IF p_receiver_email IS NULL OR p_receiver_email = '' THEN
    RAISE EXCEPTION 'Email inválido';
  END IF;

  -- Verificar que no se envíe a sí mismo
  IF EXISTS (SELECT 1 FROM profiles WHERE id = v_sender_id AND email = p_receiver_email) THEN
    RAISE EXCEPTION 'No puedes enviarte una invitación a ti mismo';
  END IF;

  -- Verificar que no exista invitación pendiente (evita race condition)
  IF EXISTS (
    SELECT 1 FROM partner_requests
    WHERE sender_id = v_sender_id 
      AND receiver_email = p_receiver_email 
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Ya existe una invitación pendiente para este correo';
  END IF;

  -- Insertar invitación
  INSERT INTO partner_requests (sender_id, receiver_email, status)
  VALUES (v_sender_id, p_receiver_email, 'pending');
END;


split_recurring_expense_rpc


DECLARE
    v_couple_id uuid;
    v_auth_user_id uuid;
    v_expense_couple_id uuid;
BEGIN
    -- Authenticate and get couple ID
    v_auth_user_id := auth.uid();
    IF v_auth_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    
    SELECT couple_id INTO v_couple_id FROM public.profiles WHERE id = v_auth_user_id;
    IF v_couple_id IS NULL THEN RAISE EXCEPTION 'User not in a couple'; END IF;

    -- Verify the old expense belongs to the couple
    SELECT couple_id INTO v_expense_couple_id FROM public.expenses WHERE id = p_old_expense_id;
    IF v_expense_couple_id != v_couple_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    -- 1. Cap the old expense
    UPDATE public.expenses
    SET recurrence_end_date = p_cutoff_date
    WHERE id = p_old_expense_id;

    -- 2. Insert the new expense
    INSERT INTO public.expenses (
        id, owner_id, couple_id, amount, date, description, is_recurring,
        recurrence_interval, recurrence_end_date, split_method, paid_by,
        assigned_user_id, budget_id, batch_id, batch_name, is_credit, category_id
    ) VALUES (
        (p_new_expense->>'id')::uuid,
        v_auth_user_id,
        v_couple_id,
        (p_new_expense->>'amount')::numeric,
        (p_new_expense->>'date')::timestamp with time zone,
        p_new_expense->>'description',
        (p_new_expense->>'is_recurring')::boolean,
        p_new_expense->>'recurrence_interval',
        (p_new_expense->>'recurrence_end_date')::timestamp with time zone,
        p_new_expense->>'split_method',
        (p_new_expense->>'paid_by')::uuid,
        (p_new_expense->>'assigned_user_id')::uuid,
        (p_new_expense->>'budget_id')::uuid,
        (p_new_expense->>'batch_id')::uuid,
        p_new_expense->>'batch_name',
        (p_new_expense->>'is_credit')::boolean,
        COALESCE((p_new_expense->>'category_id')::integer, 0)
    );
END;


stop_recurring_expense_rpc


DECLARE
  v_couple_id UUID;
BEGIN
  -- Obtener couple_id del usuario
  SELECT couple_id INTO v_couple_id
  FROM profiles
  WHERE id = auth.uid();

  -- Actualizar fecha fin de recurrencia (asegurando que pertenezca a la pareja)
  UPDATE expenses
  SET recurrence_end_date = p_end_date
  WHERE id = p_expense_id AND couple_id = v_couple_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gasto no encontrado o no tienes permiso para modificarlo';
  END IF;
END;

sync_deductions


BEGIN
    DELETE FROM deductions 
    WHERE user_id = p_user_id 
      AND id NOT IN (
          SELECT (x->>'id')::uuid 
          FROM jsonb_array_elements(p_items) x
      );

    INSERT INTO deductions (id, user_id, couple_id, amount, description, date, owner_id)
    SELECT 
        (x->>'id')::uuid,
        p_user_id,
        p_couple_id,
        (x->>'amount')::numeric,
        (x->>'description'),
        (x->>'date')::timestamp with time zone,
        auth.uid()
    FROM jsonb_array_elements(p_items) x
    ON CONFLICT (id) DO UPDATE SET
        amount = EXCLUDED.amount,
        description = EXCLUDED.description,
        date = EXCLUDED.date;
END;


sync_incomes


BEGIN
    -- 1. Borrar ingresos de este usuario que NO esten en la lista nueva
    DELETE FROM incomes 
    WHERE user_id = p_user_id 
      AND id NOT IN (
          SELECT (x->>'id')::uuid 
          FROM jsonb_array_elements(p_items) x
      );

    -- 2. Insertar o Actualizar los items de la lista
    INSERT INTO incomes (id, user_id, couple_id, amount, description, date, owner_id)
    SELECT 
        (x->>'id')::uuid,
        p_user_id,
        p_couple_id,
        (x->>'amount')::numeric,
        (x->>'description'),
        (x->>'date')::timestamp with time zone,
        auth.uid()
    FROM jsonb_array_elements(p_items) x
    ON CONFLICT (id) DO UPDATE SET
        amount = EXCLUDED.amount,
        description = EXCLUDED.description,
        date = EXCLUDED.date;
END;


update_budget_rpc


DECLARE
    v_user_id UUID;
    v_couple_id UUID;
    v_existing_couple_id UUID;
BEGIN
    -- Get the authenticated user ID
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get user's couple_id
    SELECT couple_id INTO v_couple_id
    FROM profiles
    WHERE id = v_user_id;

    -- Get the existing budget's couple_id to verify ownership
    SELECT couple_id INTO v_existing_couple_id
    FROM budgets
    WHERE id = p_budget_id;

    IF v_existing_couple_id IS NULL THEN
        RAISE EXCEPTION 'Budget not found';
    END IF;

    -- Verify the user has access to this budget
    IF v_existing_couple_id != v_couple_id THEN
        RAISE EXCEPTION 'Not authorized to update this budget';
    END IF;

    -- Validate individual budget has user_id
    IF p_type = 'individual' AND p_user_id IS NULL THEN
        RAISE EXCEPTION 'Individual budgets must have a user_id';
    END IF;

    -- Update the budget
    UPDATE budgets
    SET 
        name = p_name,
        type = p_type,
        "limit" = p_limit,
        user_id = p_user_id,
        associated_card = p_associated_card,
        default_split_method = p_default_split_method
    WHERE id = p_budget_id;

END;


update_expense_rpc


DECLARE
    v_couple_id uuid;
    v_auth_user_id uuid;
    v_expense_couple_id uuid;
BEGIN
    v_auth_user_id := auth.uid();
    IF v_auth_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT couple_id INTO v_couple_id
    FROM public.profiles
    WHERE id = v_auth_user_id;

    IF v_couple_id IS NULL THEN
        RAISE EXCEPTION 'User does not belong to a couple';
    END IF;

    SELECT couple_id INTO v_expense_couple_id
    FROM public.expenses
    WHERE id = p_expense_id;

    IF v_expense_couple_id IS NULL OR v_expense_couple_id != v_couple_id THEN
        RAISE EXCEPTION 'Expense not found or does not belong to this couple';
    END IF;

    IF p_budget_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.budgets 
            WHERE id = p_budget_id AND couple_id = v_couple_id
        ) THEN
             RAISE EXCEPTION 'Budget does not belong to this couple';
        END IF;
    END IF;

    UPDATE public.expenses
    SET
        amount = p_amount,
        date = p_date,
        description = p_description,
        is_recurring = p_is_recurring,
        recurrence_interval = p_recurrence_interval,
        recurrence_end_date = p_recurrence_end_date,
        split_method = p_split_method,
        paid_by = p_paid_by,
        assigned_user_id = p_assigned_user_id,
        budget_id = p_budget_id,
        is_credit = p_is_credit,
        category_id = p_category_id
    WHERE id = p_expense_id AND couple_id = v_couple_id;
END;


update_user_profile_rpc


DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  UPDATE profiles
  SET 
    full_name = COALESCE(p_full_name, full_name),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    phone = COALESCE(p_phone, phone),
    default_split_method = COALESCE(p_default_split_method, default_split_method)
  WHERE id = v_user_id;

  IF p_full_name IS NOT NULL THEN
    UPDATE family_members
    SET name = p_full_name
    WHERE linked_user_id = v_user_id;
  END IF;
END;
