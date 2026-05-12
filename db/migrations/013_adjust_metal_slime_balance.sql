-- 013_adjust_metal_slime_balance.sql
-- メタルスライム調整（耐性/経験値倍率/ステータス）

ALTER TABLE monsters
  ADD COLUMN IF NOT EXISTS magic_immune BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE monsters
  ADD COLUMN IF NOT EXISTS element_immune BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE monsters
  ADD COLUMN IF NOT EXISTS exp_multiplier INTEGER NOT NULL DEFAULT 1;

UPDATE monsters
SET
  base_hp = 3,
  base_defense = 9999,
  base_speed = 9999,
  evasion_rate = 50.00,
  magic_immune = TRUE,
  element_immune = TRUE,
  exp_multiplier = 20
WHERE id = 5;

UPDATE monsters
SET exp_multiplier = 5
WHERE id = 6;

UPDATE monsters
SET exp_multiplier = 1
WHERE id NOT IN (5, 6);
