-- Dry run by default: inspect the result before changing ROLLBACK to COMMIT.
-- Correct only the four omitted discounts verified against the supplied photo.
-- Keep the original extraction, product rows and product associations intact.
BEGIN;
DO $$
DECLARE
  target_id uuid := 'ee3c53db-5b95-414c-b192-58a15160b07d';
  target receipt_groups%ROWTYPE;
  original receipt_extractions%ROWTYPE;
  product receipt_items%ROWTYPE;
  discounts integer[] := ARRAY[996, 240, 1500, 1500];
  amounts numeric[];
  corrected_items jsonb;
  expected_total numeric;
BEGIN
  SELECT * INTO STRICT target FROM receipt_groups WHERE id = target_id FOR UPDATE;
  IF target.status IS DISTINCT FROM 'needs_review'
     OR target.review_reasons IS DISTINCT FROM ARRAY['total_mismatch']::text[]
     OR target.receipt_date IS DISTINCT FROM DATE '2026-09-09'
     OR target.total_declared IS DISTINCT FROM 66360
     OR target.merchant_raw IS DISTINCT FROM 'SALCOBRAND S.A.' THEN
    RAISE EXCEPTION 'Receipt changed; inspect before applying correction';
  END IF;
  PERFORM id FROM receipt_items WHERE group_id = target_id FOR UPDATE;
  SELECT array_agg(amount ORDER BY position) INTO amounts FROM receipt_items WHERE group_id = target_id;
  IF amounts IS DISTINCT FROM ARRAY[16599,3999,24999,24999]::numeric[] THEN
    RAISE EXCEPTION 'Unexpected items or discounts already repaired';
  END IF;
  SELECT * INTO STRICT original FROM receipt_extractions
    WHERE group_id = target_id AND status = 'succeeded' AND prompt_version NOT LIKE 'norm-%'
    ORDER BY created_at DESC LIMIT 1;
  FOR product IN SELECT * FROM receipt_items WHERE group_id = target_id ORDER BY position DESC LOOP
    IF product.position NOT BETWEEN 1 AND 4 THEN
      RAISE EXCEPTION 'Unexpected position';
    END IF;
    UPDATE receipt_items SET position = product.position * 2 - 1 WHERE id = product.id;
    INSERT INTO receipt_items (group_id, couple_id, description_raw, category, amount, confidence, position)
      VALUES (target_id, target.couple_id, '6% DESCUENTO SALCOBRAND', product.category,
              -discounts[product.position], 0.95, product.position * 2);
  END LOOP;
  SELECT sum(amount), jsonb_agg(jsonb_build_object(
    'description_raw', description_raw, 'qty', qty, 'unit_price', unit_price,
    'amount', amount, 'category', category, 'confidence', coalesce(confidence, 0.95)
  ) ORDER BY position) INTO expected_total, corrected_items FROM receipt_items WHERE group_id = target_id;
  IF expected_total IS DISTINCT FROM target.total_declared THEN
    RAISE EXCEPTION 'Corrected items still do not match total';
  END IF;
  INSERT INTO receipt_extractions (group_id, couple_id, model, prompt_version, raw_json, confidence, attempt, status)
    VALUES (target_id, target.couple_id, 'manual-review', 'manual-discount-correction-v1',
      original.raw_json || jsonb_build_object('items', corrected_items, 'warnings',
        jsonb_build_array('Corrección manual contrastada con la foto: descuentos omitidos de 996, 240, 1500 y 1500 pesos. Extracción original conservada.')),
      original.confidence, original.attempt + 1, 'succeeded');
  UPDATE receipt_groups SET status = 'ready', review_reasons = ARRAY[]::text[] WHERE id = target_id;
END $$;
SELECT g.status, g.total_declared, sum(i.amount) AS calculated_total,
       -sum(i.amount) FILTER (WHERE i.amount < 0) AS discounts
FROM receipt_groups g JOIN receipt_items i ON i.group_id = g.id
WHERE g.id = 'ee3c53db-5b95-414c-b192-58a15160b07d'
GROUP BY g.id;
ROLLBACK;
