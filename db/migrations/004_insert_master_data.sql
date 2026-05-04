-- 004_insert_master_data.sql
-- サンプルマスターデータ投入
-- monster_skills・job_skills テーブルの作成と初期データ挿入

-- ======================
-- monster_skills : モンスターとスキルの関連
-- ======================
CREATE TABLE IF NOT EXISTS monster_skills (
    id         SERIAL PRIMARY KEY,
    monster_id INTEGER NOT NULL REFERENCES monsters(id) ON DELETE CASCADE,
    skill_id   INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    UNIQUE (monster_id, skill_id)
);

-- ======================
-- job_skills : 職業とスキルの関連
-- ======================
CREATE TABLE IF NOT EXISTS job_skills (
    id       SERIAL PRIMARY KEY,
    job_id   INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    UNIQUE (job_id, skill_id)
);

-- ======================
-- 職業: 戦士
-- ======================
INSERT INTO jobs (id, name, tier, description) VALUES
  (1, '戦士', 'beginner', '剣と盾で戦う初級職業')
ON CONFLICT (id) DO NOTHING;

-- id採番をリセット（既存データと競合しないよう）
SELECT setval('jobs_id_seq', (SELECT MAX(id) FROM jobs));

-- ======================
-- スキル: 戦士スキル
-- ======================
-- power は倍率×100（例: 1.8倍→180）
-- effect_value のバフ系: 防御バフ50%増→50, 会心バフ30%増→30
INSERT INTO skills (id, name, element, skill_type, power, mp_cost, target, effect_type, effect_value, effect_duration, description) VALUES
  (1,  '通常攻撃',   'none', 'physical', 100, 0,  'single', NULL, NULL, NULL, '標準的な物理攻撃'),
  (2,  '渾身斬り',   'none', 'physical', 180, 8,  'single', NULL, NULL, NULL, 'MPを消費して全力で斬りつける（威力1.8倍）'),
  (3,  '火炎斬り',   'fire', 'physical', 120, 5,  'single', NULL, NULL, NULL, '炎を纏った斬撃（火属性 威力1.2倍）'),
  (4,  '水流斬り',   'water','physical', 120, 5,  'single', NULL, NULL, NULL, '水を纏った斬撃（水属性 威力1.2倍）'),
  (5,  '木葉斬り',   'wood', 'physical', 120, 5,  'single', NULL, NULL, NULL, '草木の力を纏った斬撃（木属性 威力1.2倍）'),
  (6,  '光輝斬り',   'light','physical', 120, 5,  'single', NULL, NULL, NULL, '光を纏った斬撃（光属性 威力1.2倍）'),
  (7,  '魔剣閃',     'dark', 'physical', 120, 5,  'single', NULL, NULL, NULL, '闇の力を纏った斬撃（闇属性 威力1.2倍）'),
  (8,  '鉄壁構え',   'none', 'buff',       0, 6,  'self',   'defense_up', 50, 3, '防御力を3ターン上昇させる'),
  (9,  '会心の構え', 'none', 'buff',       0, 6,  'self',   'crit_up',    30, 3, '会心率を3ターン上昇させる'),
  (10, '捨て身斬り', 'none', 'physical', 300, 0,  'single', 'self_hp_cost', 20, NULL, '自分のHP20%を消費して超強力な斬撃（威力3.0倍）')
ON CONFLICT (id) DO NOTHING;

-- モンスター用スキル
INSERT INTO skills (id, name, element, skill_type, power, mp_cost, target, effect_type, effect_value, effect_duration, description) VALUES
  -- スライムスキル
  (11, 'スライム体当たり', 'none', 'physical', 100, 0,  'single', NULL, NULL, NULL, 'スライムが体当たりする'),
  (12, '粘液スロー',       'none', 'debuff',     0, 5,  'single', 'speed_down', 30, 2, '粘液で相手の速さを落とす'),
  (13, 'べとべと液',       'none', 'debuff',     0, 5,  'single', 'defense_down', 25, 2, '粘液で相手の防御力を下げる'),
  -- ゴブリンスキル
  (14, '木の矢',       'wood', 'physical', 100, 0,  'single', NULL, NULL, NULL, '木の矢で攻撃する（木属性）'),
  (15, 'ゴブリン連撃', 'none', 'physical', 120, 8,  'single', NULL, NULL, NULL, '素早い連続攻撃（威力1.2倍）'),
  (16, '木の槍',       'wood', 'physical', 130, 12, 'single', NULL, NULL, NULL, '鋭い木の槍（木属性 威力1.3倍）'),
  -- オークスキル
  (17, '火炎呼気', 'fire', 'physical', 120, 10, 'single', NULL, NULL, NULL, '火を吐きつける（火属性 威力1.2倍）'),
  (18, '大剣振り', 'none', 'physical', 150, 15, 'single', NULL, NULL, NULL, '重厚な大剣で薙ぎ払う（威力1.5倍）'),
  (19, '火炎爆発', 'fire', 'physical', 180, 20, 'single', NULL, NULL, NULL, '強烈な火炎爆発（火属性 威力1.8倍）')
ON CONFLICT (id) DO NOTHING;

SELECT setval('skills_id_seq', (SELECT MAX(id) FROM skills));

-- ======================
-- job_skills: 戦士スキル紐付け
-- ======================
INSERT INTO job_skills (job_id, skill_id) VALUES
  (1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6), (1, 7), (1, 8), (1, 9), (1, 10)
ON CONFLICT DO NOTHING;

-- ======================
-- モンスター: スライム / ゴブリン / オーク
-- ======================
INSERT INTO monsters (id, name, base_element, base_hp, base_attack, base_defense, base_recovery, base_speed, base_max_mp, crit_rate, evasion_rate, capture_base_rate) VALUES
  (1, 'スライム', 'none', 80,  30,  10, 5,  20, 20, 2.00, 5.00, 30),
  (2, 'ゴブリン', 'wood', 150, 55,  25, 10, 35, 40, 3.00, 8.00, 15),
  (3, 'オーク',   'fire', 280, 85,  50, 15, 25, 60, 2.00, 3.00,  5)
ON CONFLICT (id) DO NOTHING;

SELECT setval('monsters_id_seq', (SELECT MAX(id) FROM monsters));

-- ======================
-- monster_skills: モンスタースキル紐付け
-- ======================
INSERT INTO monster_skills (monster_id, skill_id) VALUES
  -- スライム: 体当たり・粘液スロー・べとべと液
  (1, 11), (1, 12), (1, 13),
  -- ゴブリン: 木の矢・連撃・木の槍
  (2, 14), (2, 15), (2, 16),
  -- オーク: 火炎呼気・大剣振り・火炎爆発
  (3, 17), (3, 18), (3, 19)
ON CONFLICT DO NOTHING;

-- ======================
-- ダンジョン: はじまりの洞窟
-- ======================
INSERT INTO dungeons (id, name, dungeon_type, floor_count) VALUES
  (1, 'はじまりの洞窟', 'main', 5)
ON CONFLICT (id) DO NOTHING;

SELECT setval('dungeons_id_seq', (SELECT MAX(id) FROM dungeons));

-- ======================
-- テストユーザー（パスワード: test1234）
-- ======================
INSERT INTO users (id, username, email, password_hash) VALUES
  ('00000000-0000-0000-0000-000000000001',
   'testuser',
   'test@test.com',
   '$2a$10$juTVocMjOI/T5y3vNQHKSOyJeY23S6/Umq/E0JH/hja5C4FMVfNa.')
ON CONFLICT (id) DO NOTHING;

-- テストキャラクター（戦士Lv1）
INSERT INTO characters (id, user_id, name, current_job_id, element, hp, max_hp, mp, max_mp, attack, defense, recovery, speed, crit_rate, evasion_rate, charm) VALUES
  ('00000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000001',
   '戦士', 1, 'none',
   200, 200, 50, 50,
   60, 30, 20, 40,
   5.00, 5.00, 10)
ON CONFLICT (id) DO NOTHING;

-- キャラクタージョブ（戦士Lv1）
INSERT INTO character_jobs (character_id, job_id, level, exp) VALUES
  ('00000000-0000-0000-0000-000000000002', 1, 1, 0)
ON CONFLICT (character_id, job_id) DO NOTHING;
