-- 010_beginner_meadow_monsters_and_skills.sql
-- はじまりの草原モンスター・スキル定義を追加/更新

ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS effect_chance SMALLINT NOT NULL DEFAULT 100;

ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS is_special BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE dungeons
SET name = 'はじまりの草原', floor_count = 5
WHERE id = 1;

INSERT INTO skills (
  id, name, element, skill_type, power, mp_cost, target,
  effect_type, effect_value, effect_duration, effect_chance, is_special, description
) VALUES
  (81, '体当たり',         'none', 'physical', 100,  0, 'single', NULL,          NULL, NULL, 100, FALSE, '通常攻撃'),
  (82, '毒粘液',           'none', 'physical', 100,  4, 'single', 'poison',       50,   3,   50, FALSE, '50% で毒付与（攻撃力の50%ダメージ/3ターン）'),
  (83, 'つるたたき',       'wood', 'physical', 100,  0, 'single', NULL,          NULL, NULL, 100, FALSE, '通常攻撃'),
  (84, '光合成',           'none', 'heal',       0,  6, 'self',   'heal_max_hp_percent', 40, NULL, 100, FALSE, '最大HPの40%を回復'),
  (85, 'ぶん殴る',         'none', 'physical', 100,  0, 'single', NULL,          NULL, NULL, 100, FALSE, '通常攻撃'),
  (86, '俊敏',             'none', 'buff',       0,  5, 'self',   'speed_up',     20,   3,  100, FALSE, '素早さを20%上げる（3ターン）'),
  (87, 'メタル体当たり',   'none', 'physical', 100,  0, 'single', NULL,          NULL, NULL, 100, FALSE, '通常攻撃'),
  (88, '逃げる',           'none', 'status',     0,  0, 'self',   'escape',       NULL, NULL, 100, FALSE, '戦闘から離脱する'),
  (89, '押しつぶす',       'none', 'physical', 100,  0, 'single', NULL,          NULL, NULL, 100, FALSE, '通常攻撃'),
  (90, '粘液放出',         'none', 'physical', 100,  6, 'single', 'speed_down',   30,   2,  100, FALSE, '攻撃しつつ素早さ30%ダウン（2ターン）'),
  (91, '全力体当たり（必殺）', 'none', 'physical', 300, 16, 'all', NULL,         NULL, NULL, 100, TRUE,  '全体に通常攻撃の3倍ダメージ')
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
  description = EXCLUDED.description;

INSERT INTO monsters (
  id, name, base_element, base_hp, base_attack, base_defense,
  base_recovery, base_speed, base_max_mp, crit_rate, evasion_rate, capture_base_rate
) VALUES
  (1, 'スライム',             'none',  80,  30,  10,  5, 20, 20, 2.00,  5.00, 30),
  (2, 'ポイズンスライム',     'none', 110,  36,  14,  8, 22, 30, 3.00,  6.00, 20),
  (3, 'くさばな',             'wood', 150,  32,  20, 14, 18, 40, 2.00,  4.00, 18),
  (4, 'ちびゴブリン',         'wood', 170,  48,  24, 10, 38, 35, 4.00,  8.00, 14),
  (5, 'メタルスライム',       'none',  70,  26, 120,  8, 45, 12, 1.00, 25.00,  3),
  (6, 'グリーンスライムキング', 'wood', 480, 100,  50, 25, 30, 90, 5.00, 10.00,  1)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  base_element = EXCLUDED.base_element,
  base_hp = EXCLUDED.base_hp,
  base_attack = EXCLUDED.base_attack,
  base_defense = EXCLUDED.base_defense,
  base_recovery = EXCLUDED.base_recovery,
  base_speed = EXCLUDED.base_speed,
  base_max_mp = EXCLUDED.base_max_mp,
  crit_rate = EXCLUDED.crit_rate,
  evasion_rate = EXCLUDED.evasion_rate,
  capture_base_rate = EXCLUDED.capture_base_rate;

DELETE FROM monster_skills
WHERE monster_id BETWEEN 1 AND 6;

INSERT INTO monster_skills (monster_id, skill_id) VALUES
  (1, 81),
  (2, 81), (2, 82),
  (3, 83), (3, 84),
  (4, 85), (4, 86),
  (5, 87), (5, 88),
  (6, 89), (6, 90), (6, 91)
ON CONFLICT DO NOTHING;

SELECT setval('skills_id_seq', (SELECT MAX(id) FROM skills));
SELECT setval('monsters_id_seq', (SELECT MAX(id) FROM monsters));
