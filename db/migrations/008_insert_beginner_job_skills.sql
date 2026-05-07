-- 008_insert_beginner_job_skills.sql
-- 全初級職のスキルデータとレベルアップ習得テーブルを登録する
-- 既存データとの重複は ON CONFLICT DO NOTHING で回避

-- ======================
-- job_skill_learns : 職業レベルアップ時のスキル習得テーブル
-- ======================
CREATE TABLE IF NOT EXISTS job_skill_learns (
    id              SERIAL PRIMARY KEY,
    job_id          INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    skill_id        INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    required_level  SMALLINT NOT NULL,          -- 習得に必要なレベル
    skill_order     SMALLINT NOT NULL,           -- 職業内でのスキル順（1〜10）
    UNIQUE (job_id, skill_id),
    UNIQUE (job_id, skill_order)
);
CREATE INDEX IF NOT EXISTS idx_job_skill_learns_job_id ON job_skill_learns(job_id);

-- ======================
-- スキル: 全初級職スキル追加
-- power は倍率×100（例: 1.8倍→180）
-- ======================

-- 戦士: 欠落していた固有スキル「挑発」を補完
INSERT INTO skills (id, name, element, skill_type, power, mp_cost, target, effect_type, effect_value, effect_duration, description) VALUES
  (20, '挑発',         'none', 'debuff',    0,   6,  'all',    'taunt',        1,  1, '敵全員がそのターン自分のみを攻撃対象にする')
ON CONFLICT (id) DO NOTHING;

-- 魔法使いスキル（id=21〜30）
INSERT INTO skills (id, name, element, skill_type, power, mp_cost, target, effect_type, effect_value, effect_duration, description) VALUES
  (21, 'マジックブラスト', 'none',  'magical',  180, 8,  'single', NULL,           NULL, NULL, 'MPを消費して魔力を凝縮した一撃（威力1.8倍）'),
  (22, '魔力集中',        'none',  'buff',        0, 6,  'self',   'attack_up',      50, 3,   '自身の攻撃力を3ターン上昇させる'),
  (23, 'ファイアボール',  'fire',  'magical',   120, 5,  'single', NULL,           NULL, NULL, '火球を放つ（火属性 威力1.2倍）'),
  (24, 'マジックブレイク','none',  'debuff',      0, 6,  'single', 'defense_down',   30, 2,   '敵単体の防御力を2ターン低下させる'),
  (25, 'アイスランス',    'water', 'magical',   120, 5,  'single', NULL,           NULL, NULL, '氷の槍を放つ（水属性 威力1.2倍）'),
  (26, '全体魔法',        'none',  'magical',    80, 10, 'all',    NULL,           NULL, NULL, '敵全体に魔力を放つ（威力0.8倍）'),
  (27, 'ウィンドカッター','wood',  'magical',   120, 5,  'single', NULL,           NULL, NULL, '風の刃を飛ばす（木属性 威力1.2倍）'),
  (28, 'ホーリーレイ',    'light', 'magical',   120, 5,  'single', NULL,           NULL, NULL, '聖なる光線（光属性 威力1.2倍）'),
  (29, 'ダークボルト',    'dark',  'magical',   120, 5,  'single', NULL,           NULL, NULL, '暗黒の雷撃（闇属性 威力1.2倍）'),
  (30, '禁呪',            'none',  'magical',   250, 20, 'single', NULL,           NULL, NULL, '封印された禁断の魔法（威力2.5倍）')
ON CONFLICT (id) DO NOTHING;

-- 僧侶スキル（id=31〜40）
INSERT INTO skills (id, name, element, skill_type, power, mp_cost, target, effect_type, effect_value, effect_duration, description) VALUES
  (31, 'スマイト',        'none',  'physical',  120, 5,  'single', NULL,           NULL, NULL, '神聖な力で打つ（威力1.2倍）'),
  (32, 'ヒール',          'none',  'heal',        0, 8,  'ally_single', NULL,      NULL, NULL, '味方単体のHPを回復する'),
  (33, 'セイクリッドフレイム', 'fire', 'magical', 120, 5,  'single', NULL,          NULL, NULL, '聖なる炎で攻撃する（火属性 威力1.2倍）'),
  (34, 'リジェネ',        'none',  'heal',        0, 8,  'ally_single', 'regen',    20, 3,   '毎ターンHPを回復させる（3ターン）'),
  (35, 'ホーリーウォーター', 'water', 'magical', 120, 5,  'single', NULL,          NULL, NULL, '聖水で攻撃する（水属性 威力1.2倍）'),
  (36, 'ホーリーシールド', 'none', 'buff',        0, 10, 'ally_all','defense_up',   50, 3,   '味方全体の防御力を3ターン上昇させる'),
  (37, 'ネイチャーボルト', 'wood',  'magical',   120, 5,  'single', NULL,           NULL, NULL, '自然の力で攻撃する（木属性 威力1.2倍）'),
  (38, 'ホーリーバースト', 'light', 'magical',   120, 5,  'single', NULL,           NULL, NULL, '聖なる爆発（光属性 威力1.2倍）'),
  (39, 'シャドウウェイブ', 'dark',  'magical',   120, 5,  'single', NULL,           NULL, NULL, '影の波動（闇属性 威力1.2倍）'),
  (40, '全体ヒール',      'none',  'heal',        0, 15, 'ally_all', NULL,         NULL, NULL, '味方全体のHPを回復する')
ON CONFLICT (id) DO NOTHING;

-- 盗賊スキル（id=41〜50）
INSERT INTO skills (id, name, element, skill_type, power, mp_cost, target, effect_type, effect_value, effect_duration, description) VALUES
  (41, 'バックスタブ',    'none',  'physical',  120, 5,  'single', NULL,           NULL, NULL, '不意打ちの一撃（威力1.2倍）'),
  (42, '煙幕',            'none',  'debuff',      0, 6,  'all',    'hit_down',       30, 2,   '敵全体の命中率を2ターン低下させる'),
  (43, '火炎手裏剣',      'fire',  'physical',  120, 5,  'single', NULL,           NULL, NULL, '炎を纏った手裏剣（火属性 威力1.2倍）'),
  (44, '毒針',            'none',  'status',      0, 6,  'single', 'poison',         10, 3,   '敵単体に毒を付与する'),
  (45, '氷刃投げ',        'water', 'physical',  120, 5,  'single', NULL,           NULL, NULL, '氷の刃を投げる（水属性 威力1.2倍）'),
  (46, '急所突き',        'none',  'physical',  140, 6,  'single', 'crit_up',        20, NULL,'会心率+20%・威力1.4倍の一撃'),
  (47, '風刃投げ',        'wood',  'physical',  120, 5,  'single', NULL,           NULL, NULL, '風の刃を投げる（木属性 威力1.2倍）'),
  (48, '閃光手裏剣',      'light', 'physical',  120, 5,  'single', NULL,           NULL, NULL, '光を纏った手裏剣（光属性 威力1.2倍）'),
  (49, '影斬り',          'dark',  'physical',  120, 5,  'single', NULL,           NULL, NULL, '影に紛れた斬撃（闇属性 威力1.2倍）'),
  (50, '乱れ斬り',        'none',  'physical',   70, 10, 'single', 'multi_hit',      3,  NULL,'ランダムに3回攻撃する（各0.7倍）')
ON CONFLICT (id) DO NOTHING;

-- 狩人スキル（id=51〜60）
INSERT INTO skills (id, name, element, skill_type, power, mp_cost, target, effect_type, effect_value, effect_duration, description) VALUES
  (51, 'アロー',          'none',  'physical',  120, 5,  'single', NULL,           NULL, NULL, '弓矢で攻撃する（威力1.2倍）'),
  (52, '野生の勘',        'none',  'buff',        0, 6,  'self',   'evasion_up',     30, 3,   '回避率を3ターン上昇させる'),
  (53, '火矢',            'fire',  'physical',  120, 5,  'single', NULL,           NULL, NULL, '炎を纏った矢（火属性 威力1.2倍）'),
  (54, 'スロウアロー',    'none',  'debuff',      0, 6,  'single', 'speed_down',     30, 2,   '敵単体の素早さを2ターン低下させる'),
  (55, '氷矢',            'water', 'physical',  120, 5,  'single', NULL,           NULL, NULL, '氷を纏った矢（水属性 威力1.2倍）'),
  (56, '風読み',          'none',  'buff',        0, 6,  'self',   'speed_up',       30, 3,   '自身の素早さを3ターン上昇させる'),
  (57, '嵐矢',            'wood',  'physical',  120, 5,  'single', NULL,           NULL, NULL, '嵐の力を纏った矢（木属性 威力1.2倍）'),
  (58, '閃光矢',          'light', 'physical',  120, 5,  'single', NULL,           NULL, NULL, '光を纏った矢（光属性 威力1.2倍）'),
  (59, '影矢',            'dark',  'physical',  120, 5,  'single', NULL,           NULL, NULL, '影を纏った矢（闇属性 威力1.2倍）'),
  (60, 'ポイズンシャワー','none',  'physical',   80, 12, 'all',    'poison',         10, 3,   '敵全体に毒の矢を浴びせる（威力0.8倍＋毒）')
ON CONFLICT (id) DO NOTHING;

-- 格闘家スキル（id=61〜70）
INSERT INTO skills (id, name, element, skill_type, power, mp_cost, target, effect_type, effect_value, effect_duration, description) VALUES
  (61, '正拳突き',        'none',  'physical',  120, 5,  'single', NULL,           NULL, NULL, '気を込めた正面突き（威力1.2倍）'),
  (62, '気合い溜め',      'none',  'buff',        0, 6,  'self',   'attack_up',      80, 1,   '次の攻撃の威力を大幅に上昇させる'),
  (63, '火炎拳',          'fire',  'physical',  120, 5,  'single', NULL,           NULL, NULL, '炎を纏った拳打（火属性 威力1.2倍）'),
  (64, '回し蹴り',        'none',  'physical',   80, 8,  'all',    NULL,           NULL, NULL, '敵全体に蹴りを放つ（威力0.8倍）'),
  (65, '氷砕拳',          'water', 'physical',  120, 5,  'single', NULL,           NULL, NULL, '氷の力を纏った拳打（水属性 威力1.2倍）'),
  (66, '破壊の拳',        'none',  'debuff',      0, 6,  'single', 'defense_down',   30, 2,   '敵単体の防御力を2ターン低下させる'),
  (67, '嵐脚',            'wood',  'physical',  120, 5,  'single', NULL,           NULL, NULL, '嵐の力を纏った蹴り（木属性 威力1.2倍）'),
  (68, '聖拳',            'light', 'physical',  120, 5,  'single', NULL,           NULL, NULL, '聖なる力を纏った拳打（光属性 威力1.2倍）'),
  (69, '魔拳',            'dark',  'physical',  120, 5,  'single', NULL,           NULL, NULL, '魔の力を纏った拳打（闇属性 威力1.2倍）'),
  (70, '砕拳',            'none',  'physical',  150, 10, 'single', 'defense_down',   30, 2,   '攻撃しながら敵の防御力を下げる（威力1.5倍）')
ON CONFLICT (id) DO NOTHING;

-- まものつかいスキル（id=71〜80）
INSERT INTO skills (id, name, element, skill_type, power, mp_cost, target, effect_type, effect_value, effect_duration, description) VALUES
  (71, 'モンスター鞭',    'none',  'physical',  120, 5,  'single', NULL,           NULL, NULL, '鞭で攻撃する（威力1.2倍）'),
  (72, '指示',            'none',  'buff',        0, 6,  'ally_single', 'attack_up', 50, 1,  '味方モンスター1体の次の攻撃威力を大幅に上昇させる'),
  (73, '火炎鞭',          'fire',  'physical',  120, 5,  'single', NULL,           NULL, NULL, '炎を纏った鞭（火属性 威力1.2倍）'),
  (74, '連携攻撃',        'none',  'physical',  100, 8,  'single', 'combo',          1,  NULL,'自分と味方モンスター1体が追加攻撃する'),
  (75, '氷結鞭',          'water', 'physical',  120, 5,  'single', NULL,           NULL, NULL, '氷を纏った鞭（水属性 威力1.2倍）'),
  (76, '魅了の声',        'none',  'status',      0, 8,  'single', 'bind',           1,  1,   '敵単体の行動を1ターン封じる'),
  (77, '嵐鞭',            'wood',  'physical',  120, 5,  'single', NULL,           NULL, NULL, '嵐の力を纏った鞭（木属性 威力1.2倍）'),
  (78, '聖なる鞭',        'light', 'physical',  120, 5,  'single', NULL,           NULL, NULL, '聖なる力を纏った鞭（光属性 威力1.2倍）'),
  (79, '影鞭',            'dark',  'physical',  120, 5,  'single', NULL,           NULL, NULL, '影を纏った鞭（闇属性 威力1.2倍）'),
  (80, '総進撃',          'none',  'buff',        0, 10, 'ally_all', 'speed_up',    30, 3,   '味方モンスター全体の素早さを3ターン上昇させる')
ON CONFLICT (id) DO NOTHING;

SELECT setval('skills_id_seq', (SELECT MAX(id) FROM skills));

-- ======================
-- job_skills: 全初級職スキル紐付け
-- 戦士（job_id=1）: 渾身斬り/挑発/火炎斬り/鉄壁構え/氷結斬り/会心の構え/嵐斬り/聖剣閃/魔剣閃/捨て身斬り
-- ======================
INSERT INTO job_skills (job_id, skill_id)
SELECT j.id, s.id
FROM jobs j, skills s
WHERE j.name = '戦士' AND s.id IN (2, 20, 3, 8, 4, 9, 5, 6, 7, 10)
ON CONFLICT DO NOTHING;

-- 魔法使い（job_id=2）
INSERT INTO job_skills (job_id, skill_id)
SELECT j.id, s.id
FROM jobs j, skills s
WHERE j.name = '魔法使い' AND s.id IN (21, 22, 23, 24, 25, 26, 27, 28, 29, 30)
ON CONFLICT DO NOTHING;

-- 僧侶（job_id=3）
INSERT INTO job_skills (job_id, skill_id)
SELECT j.id, s.id
FROM jobs j, skills s
WHERE j.name = '僧侶' AND s.id IN (31, 32, 33, 34, 35, 36, 37, 38, 39, 40)
ON CONFLICT DO NOTHING;

-- 盗賊（job_id=4）
INSERT INTO job_skills (job_id, skill_id)
SELECT j.id, s.id
FROM jobs j, skills s
WHERE j.name = '盗賊' AND s.id IN (41, 42, 43, 44, 45, 46, 47, 48, 49, 50)
ON CONFLICT DO NOTHING;

-- 狩人（job_id=5）
INSERT INTO job_skills (job_id, skill_id)
SELECT j.id, s.id
FROM jobs j, skills s
WHERE j.name = '狩人' AND s.id IN (51, 52, 53, 54, 55, 56, 57, 58, 59, 60)
ON CONFLICT DO NOTHING;

-- 格闘家（job_id=6）
INSERT INTO job_skills (job_id, skill_id)
SELECT j.id, s.id
FROM jobs j, skills s
WHERE j.name = '格闘家' AND s.id IN (61, 62, 63, 64, 65, 66, 67, 68, 69, 70)
ON CONFLICT DO NOTHING;

-- まものつかい（job_id=7）
INSERT INTO job_skills (job_id, skill_id)
SELECT j.id, s.id
FROM jobs j, skills s
WHERE j.name = 'まものつかい' AND s.id IN (71, 72, 73, 74, 75, 76, 77, 78, 79, 80)
ON CONFLICT DO NOTHING;

-- ======================
-- job_skill_learns: 全初級職レベルアップ習得テーブル
-- 習得順（全職共通）: Lv1→Lv5→Lv10→Lv15→Lv20→Lv25→Lv30→Lv35→Lv40→Lv50
-- ======================

-- 戦士: Lv1=渾身斬り(2) Lv5=挑発(20) Lv10=火炎斬り(3) Lv15=鉄壁構え(8)
--       Lv20=氷結斬り(4) Lv25=会心の構え(9) Lv30=嵐斬り(5) Lv35=聖剣閃(6) Lv40=魔剣閃(7) Lv50=捨て身斬り(10)
INSERT INTO job_skill_learns (job_id, skill_id, required_level, skill_order)
SELECT j.id, vals.skill_id, vals.required_level, vals.skill_order
FROM jobs j
JOIN (VALUES
    ( 2,  1,  1),
    (20,  5,  2),
    ( 3, 10,  3),
    ( 8, 15,  4),
    ( 4, 20,  5),
    ( 9, 25,  6),
    ( 5, 30,  7),
    ( 6, 35,  8),
    ( 7, 40,  9),
    (10, 50, 10)
) AS vals(skill_id, required_level, skill_order) ON TRUE
WHERE j.name = '戦士'
ON CONFLICT DO NOTHING;

-- 魔法使い: Lv1=マジックブラスト(21) Lv5=魔力集中(22) Lv10=ファイアボール(23) Lv15=マジックブレイク(24)
--           Lv20=アイスランス(25) Lv25=全体魔法(26) Lv30=ウィンドカッター(27) Lv35=ホーリーレイ(28) Lv40=ダークボルト(29) Lv50=禁呪(30)
INSERT INTO job_skill_learns (job_id, skill_id, required_level, skill_order)
SELECT j.id, vals.skill_id, vals.required_level, vals.skill_order
FROM jobs j
JOIN (VALUES
    (21,  1,  1),
    (22,  5,  2),
    (23, 10,  3),
    (24, 15,  4),
    (25, 20,  5),
    (26, 25,  6),
    (27, 30,  7),
    (28, 35,  8),
    (29, 40,  9),
    (30, 50, 10)
) AS vals(skill_id, required_level, skill_order) ON TRUE
WHERE j.name = '魔法使い'
ON CONFLICT DO NOTHING;

-- 僧侶: Lv1=スマイト(31) Lv5=ヒール(32) Lv10=セイクリッドフレイム(33) Lv15=リジェネ(34)
--       Lv20=ホーリーウォーター(35) Lv25=ホーリーシールド(36) Lv30=ネイチャーボルト(37) Lv35=ホーリーバースト(38) Lv40=シャドウウェイブ(39) Lv50=全体ヒール(40)
INSERT INTO job_skill_learns (job_id, skill_id, required_level, skill_order)
SELECT j.id, vals.skill_id, vals.required_level, vals.skill_order
FROM jobs j
JOIN (VALUES
    (31,  1,  1),
    (32,  5,  2),
    (33, 10,  3),
    (34, 15,  4),
    (35, 20,  5),
    (36, 25,  6),
    (37, 30,  7),
    (38, 35,  8),
    (39, 40,  9),
    (40, 50, 10)
) AS vals(skill_id, required_level, skill_order) ON TRUE
WHERE j.name = '僧侶'
ON CONFLICT DO NOTHING;

-- 盗賊: Lv1=バックスタブ(41) Lv5=煙幕(42) Lv10=火炎手裏剣(43) Lv15=毒針(44)
--       Lv20=氷刃投げ(45) Lv25=急所突き(46) Lv30=風刃投げ(47) Lv35=閃光手裏剣(48) Lv40=影斬り(49) Lv50=乱れ斬り(50)
INSERT INTO job_skill_learns (job_id, skill_id, required_level, skill_order)
SELECT j.id, vals.skill_id, vals.required_level, vals.skill_order
FROM jobs j
JOIN (VALUES
    (41,  1,  1),
    (42,  5,  2),
    (43, 10,  3),
    (44, 15,  4),
    (45, 20,  5),
    (46, 25,  6),
    (47, 30,  7),
    (48, 35,  8),
    (49, 40,  9),
    (50, 50, 10)
) AS vals(skill_id, required_level, skill_order) ON TRUE
WHERE j.name = '盗賊'
ON CONFLICT DO NOTHING;

-- 狩人: Lv1=アロー(51) Lv5=野生の勘(52) Lv10=火矢(53) Lv15=スロウアロー(54)
--       Lv20=氷矢(55) Lv25=風読み(56) Lv30=嵐矢(57) Lv35=閃光矢(58) Lv40=影矢(59) Lv50=ポイズンシャワー(60)
INSERT INTO job_skill_learns (job_id, skill_id, required_level, skill_order)
SELECT j.id, vals.skill_id, vals.required_level, vals.skill_order
FROM jobs j
JOIN (VALUES
    (51,  1,  1),
    (52,  5,  2),
    (53, 10,  3),
    (54, 15,  4),
    (55, 20,  5),
    (56, 25,  6),
    (57, 30,  7),
    (58, 35,  8),
    (59, 40,  9),
    (60, 50, 10)
) AS vals(skill_id, required_level, skill_order) ON TRUE
WHERE j.name = '狩人'
ON CONFLICT DO NOTHING;

-- 格闘家: Lv1=正拳突き(61) Lv5=気合い溜め(62) Lv10=火炎拳(63) Lv15=回し蹴り(64)
--         Lv20=氷砕拳(65) Lv25=破壊の拳(66) Lv30=嵐脚(67) Lv35=聖拳(68) Lv40=魔拳(69) Lv50=砕拳(70)
INSERT INTO job_skill_learns (job_id, skill_id, required_level, skill_order)
SELECT j.id, vals.skill_id, vals.required_level, vals.skill_order
FROM jobs j
JOIN (VALUES
    (61,  1,  1),
    (62,  5,  2),
    (63, 10,  3),
    (64, 15,  4),
    (65, 20,  5),
    (66, 25,  6),
    (67, 30,  7),
    (68, 35,  8),
    (69, 40,  9),
    (70, 50, 10)
) AS vals(skill_id, required_level, skill_order) ON TRUE
WHERE j.name = '格闘家'
ON CONFLICT DO NOTHING;

-- まものつかい: Lv1=モンスター鞭(71) Lv5=指示(72) Lv10=火炎鞭(73) Lv15=連携攻撃(74)
--              Lv20=氷結鞭(75) Lv25=魅了の声(76) Lv30=嵐鞭(77) Lv35=聖なる鞭(78) Lv40=影鞭(79) Lv50=総進撃(80)
INSERT INTO job_skill_learns (job_id, skill_id, required_level, skill_order)
SELECT j.id, vals.skill_id, vals.required_level, vals.skill_order
FROM jobs j
JOIN (VALUES
    (71,  1,  1),
    (72,  5,  2),
    (73, 10,  3),
    (74, 15,  4),
    (75, 20,  5),
    (76, 25,  6),
    (77, 30,  7),
    (78, 35,  8),
    (79, 40,  9),
    (80, 50, 10)
) AS vals(skill_id, required_level, skill_order) ON TRUE
WHERE j.name = 'まものつかい'
ON CONFLICT DO NOTHING;
