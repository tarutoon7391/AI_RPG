-- 006_insert_beginner_jobs.sql
-- 初級職（戦士以外）のマスターデータ挿入
-- 戦士は 004_insert_master_data.sql で登録済み

-- ======================
-- 職業: 初級職（魔法使い・僧侶・盗賊・狩人・格闘家・まものつかい）
-- ======================
INSERT INTO jobs (name, tier, description) VALUES
  ('魔法使い', 'beginner', '魔法を操る初級職業'),
  ('僧侶',     'beginner', '回復魔法を使う初級職業'),
  ('盗賊',     'beginner', '素早さと奇襲を得意とする初級職業'),
  ('狩人',     'beginner', '弓矢で遠距離から攻撃する初級職業'),
  ('格闘家',   'beginner', '素手で戦う初級職業'),
  ('まものつかい', 'beginner', 'モンスターを仲間にする初級職業')
ON CONFLICT DO NOTHING;
