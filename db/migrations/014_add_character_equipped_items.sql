-- 014_add_character_equipped_items.sql
-- 装備状態をDBで管理するためのカラム追加

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS equipped_items JSONB NOT NULL DEFAULT '{
    "head": null,
    "body": null,
    "legs": null,
    "shoes": null,
    "accessory": null
  }'::jsonb;

-- 既存データをスロット固定の形式へ正規化
UPDATE characters
SET equipped_items = jsonb_build_object(
  'head', CASE
    WHEN jsonb_typeof(equipped_items->'head') = 'string' THEN equipped_items->>'head'
    ELSE NULL
  END,
  'body', CASE
    WHEN jsonb_typeof(equipped_items->'body') = 'string' THEN equipped_items->>'body'
    ELSE NULL
  END,
  'legs', CASE
    WHEN jsonb_typeof(equipped_items->'legs') = 'string' THEN equipped_items->>'legs'
    ELSE NULL
  END,
  'shoes', CASE
    WHEN jsonb_typeof(equipped_items->'shoes') = 'string' THEN equipped_items->>'shoes'
    ELSE NULL
  END,
  'accessory', CASE
    WHEN jsonb_typeof(equipped_items->'accessory') = 'string' THEN equipped_items->>'accessory'
    ELSE NULL
  END
);
