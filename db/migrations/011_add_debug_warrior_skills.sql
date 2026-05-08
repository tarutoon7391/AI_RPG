-- 011_add_debug_warrior_skills.sql
-- 戦士向けのデバッグ用バフ/デバフスキルを追加する

ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS is_debug BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO skills (
  id, name, element, skill_type, power, mp_cost, target,
  effect_type, effect_value, effect_duration, effect_chance, is_special, is_debug, description
) VALUES
  (92,  '[DEBUG] 毒付与（自分）',       'none', 'status',  0, 0, 'self',   'poison',     50, 3, 100, FALSE, TRUE, '自分に毒を付与（100%、攻撃力の50%ダメージ、3ターン）'),
  (93,  '[DEBUG] 素早さアップ（自分）', 'none', 'buff',    0, 0, 'self',   'speed_up',   20, 3, 100, FALSE, TRUE, '自分の素早さを20%アップ（3ターン）'),
  (94,  '[DEBUG] 素早さダウン（自分）', 'none', 'debuff',  0, 0, 'self',   'speed_down', 30, 2, 100, FALSE, TRUE, '自分の素早さを30%ダウン（2ターン）'),
  (95,  '[DEBUG] 防御アップ（自分）',   'none', 'buff',    0, 0, 'self',   'defense_up', 30, 3, 100, FALSE, TRUE, '自分の防御力をアップ（3ターン）'),
  (96,  '[DEBUG] 攻撃アップ（自分）',   'none', 'buff',    0, 0, 'self',   'attack_up',  30, 3, 100, FALSE, TRUE, '自分の攻撃力をアップ（3ターン）'),
  (97,  '[DEBUG] 毒付与（敵）',         'none', 'status',  0, 0, 'single', 'poison',     50, 3, 100, FALSE, TRUE, '対象の敵に毒を付与（100%、攻撃力の50%ダメージ、3ターン）'),
  (98,  '[DEBUG] 素早さアップ（敵）',   'none', 'buff',    0, 0, 'single', 'speed_up',   20, 3, 100, FALSE, TRUE, '対象の敵の素早さを20%アップ（3ターン）'),
  (99,  '[DEBUG] 素早さダウン（敵）',   'none', 'debuff',  0, 0, 'single', 'speed_down', 30, 2, 100, FALSE, TRUE, '対象の敵の素早さを30%ダウン（2ターン）'),
  (100, '[DEBUG] 防御アップ（敵）',     'none', 'buff',    0, 0, 'single', 'defense_up', 30, 3, 100, FALSE, TRUE, '対象の敵の防御力をアップ（3ターン）'),
  (101, '[DEBUG] 攻撃アップ（敵）',     'none', 'buff',    0, 0, 'single', 'attack_up',  30, 3, 100, FALSE, TRUE, '対象の敵の攻撃力をアップ（3ターン）')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  element = EXCLUDED.element,
  skill_type = EXCLUDED.skill_type,
  power = EXCLUDED.power,
  mp_cost = EXCLUDED.mp_cost,
  target = EXCLUDED.target,
  effect_type = EXCLUDED.effect_type,
  effect_value = EXCLUDED.effect_value,
  effect_duration = EXCLUDED.effect_duration,
  effect_chance = EXCLUDED.effect_chance,
  is_special = EXCLUDED.is_special,
  is_debug = EXCLUDED.is_debug,
  description = EXCLUDED.description;

INSERT INTO job_skills (job_id, skill_id, required_level)
SELECT j.id, vals.skill_id, 1
FROM jobs j
JOIN (VALUES (92), (93), (94), (95), (96), (97), (98), (99), (100), (101)) AS vals(skill_id) ON TRUE
WHERE j.name = '戦士'
ON CONFLICT (job_id, skill_id) DO UPDATE
SET required_level = EXCLUDED.required_level;

INSERT INTO job_skill_learns (job_id, skill_id, required_level, skill_order)
SELECT j.id, vals.skill_id, 1, vals.skill_order
FROM jobs j
JOIN (
  VALUES
    (92, 101),
    (93, 102),
    (94, 103),
    (95, 104),
    (96, 105),
    (97, 106),
    (98, 107),
    (99, 108),
    (100, 109),
    (101, 110)
) AS vals(skill_id, skill_order) ON TRUE
WHERE j.name = '戦士'
ON CONFLICT (job_id, skill_id) DO UPDATE
SET required_level = EXCLUDED.required_level,
    skill_order = EXCLUDED.skill_order;

INSERT INTO character_job_skills (character_id, job_id, skill_id)
SELECT cj.character_id, cj.job_id, vals.skill_id
FROM character_jobs cj
JOIN jobs j ON j.id = cj.job_id AND j.name = '戦士'
JOIN (VALUES (92), (93), (94), (95), (96), (97), (98), (99), (100), (101)) AS vals(skill_id) ON TRUE
WHERE COALESCE(cj.level, 1) >= 1
ON CONFLICT (character_id, job_id, skill_id) DO NOTHING;

SELECT setval('skills_id_seq', (SELECT MAX(id) FROM skills));
