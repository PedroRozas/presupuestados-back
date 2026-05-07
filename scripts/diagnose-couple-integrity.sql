-- Detecta parejas con mas de dos usuarios vinculados.
-- Ejecutar antes de aplicar restricciones si existe data historica migrada.

SELECT
  fm.couple_id,
  c.invite_code,
  count(*) FILTER (WHERE fm.linked_user_id IS NOT NULL) AS linked_members,
  json_agg(
    json_build_object(
      'family_member_id', fm.id,
      'name', fm.name,
      'linked_user_id', fm.linked_user_id,
      'email', p.email
    )
    ORDER BY fm.created_at
  ) AS members
FROM family_members fm
LEFT JOIN couples c ON c.id = fm.couple_id
LEFT JOIN profiles p ON p.id = fm.linked_user_id
WHERE fm.couple_id IS NOT NULL
GROUP BY fm.couple_id, c.invite_code
HAVING count(*) FILTER (WHERE fm.linked_user_id IS NOT NULL) > 2
ORDER BY linked_members DESC;
