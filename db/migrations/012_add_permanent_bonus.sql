-- 012_add_permanent_bonus.sql
-- permanent_bonus カラムの追加と既存キャラクターへのマイグレーション
-- 転職時に引き継がれる永続ボーナスを管理するカラム

-- ============================================================
-- characters テーブルに permanent_bonus カラムを追加
-- ============================================================
ALTER TABLE characters ADD COLUMN IF NOT EXISTS permanent_bonus JSONB NOT NULL DEFAULT '{}';

-- ============================================================
-- 既存キャラクターへの永続ボーナス付与と正しいステータスへの修正
-- 処理内容:
--   1. 職業・レベルに基づくLv1基礎ステータス＋通常成長値でステータスを再計算
--   2. 5レベルごとの永続ボーナスを計算してpermanent_bonusカラムに設定
--   3. キャラクターのステータスに永続ボーナスを加算
--   4. HP・MPを最大値まで全回復
-- ============================================================
DO $$
DECLARE
  r RECORD;
  jname TEXT;
  jlevel INT;
  milestones INT;

  -- Lv1基礎ステータス
  base_hp  INT; base_mp  INT; base_atk INT; base_def INT;
  base_rec INT; base_spd INT; base_chrm INT;

  -- レベルアップ成長値（1レベルあたり）
  g_hp  INT; g_mp  INT; g_atk INT; g_def INT;
  g_rec INT; g_spd INT; g_chrm INT;

  -- 永続ボーナス（5レベルごと）
  perm_hp  INT; perm_mp  INT; perm_atk INT; perm_def INT;
  perm_rec INT; perm_spd INT; perm_chrm INT;

  -- 確定後のステータス
  new_max_hp  INT; new_max_mp  INT;
  new_atk INT; new_def INT; new_rec INT; new_spd INT; new_chrm INT;

BEGIN
  FOR r IN
    SELECT c.id,
           COALESCE(j.name, '戦士') AS job_name,
           COALESCE(cj.level, 1)    AS job_level
    FROM   characters c
    LEFT JOIN jobs j         ON j.id = c.current_job_id
    LEFT JOIN character_jobs cj ON cj.character_id = c.id
                               AND cj.job_id = c.current_job_id
  LOOP
    jname  := r.job_name;
    jlevel := GREATEST(1, r.job_level);
    milestones := FLOOR(jlevel::NUMERIC / 5)::INT;

    -- 職業別 Lv1基礎ステータス & 成長値
    CASE jname
      WHEN '戦士' THEN
        base_hp:=200; base_mp:=50;  base_atk:=60; base_def:=50; base_rec:=20; base_spd:=30; base_chrm:=20;
        g_hp:=15; g_mp:=2; g_atk:=4; g_def:=4; g_rec:=1; g_spd:=2; g_chrm:=1;
      WHEN '魔法使い' THEN
        base_hp:=120; base_mp:=100; base_atk:=70; base_def:=25; base_rec:=30; base_spd:=35; base_chrm:=25;
        g_hp:=8; g_mp:=8; g_atk:=5; g_def:=2; g_rec:=2; g_spd:=2; g_chrm:=1;
      WHEN '僧侶' THEN
        base_hp:=150; base_mp:=80;  base_atk:=40; base_def:=35; base_rec:=60; base_spd:=25; base_chrm:=30;
        g_hp:=10; g_mp:=6; g_atk:=2; g_def:=3; g_rec:=5; g_spd:=1; g_chrm:=2;
      WHEN '盗賊' THEN
        base_hp:=140; base_mp:=60;  base_atk:=55; base_def:=30; base_rec:=20; base_spd:=55; base_chrm:=35;
        g_hp:=10; g_mp:=3; g_atk:=3; g_def:=2; g_rec:=1; g_spd:=5; g_chrm:=2;
      WHEN '狩人' THEN
        base_hp:=140; base_mp:=60;  base_atk:=55; base_def:=30; base_rec:=20; base_spd:=50; base_chrm:=40;
        g_hp:=10; g_mp:=3; g_atk:=3; g_def:=2; g_rec:=1; g_spd:=4; g_chrm:=3;
      WHEN '格闘家' THEN
        base_hp:=160; base_mp:=30;  base_atk:=75; base_def:=40; base_rec:=20; base_spd:=45; base_chrm:=20;
        g_hp:=12; g_mp:=1; g_atk:=6; g_def:=3; g_rec:=1; g_spd:=3; g_chrm:=1;
      WHEN 'まものつかい' THEN
        base_hp:=140; base_mp:=70;  base_atk:=50; base_def:=30; base_rec:=25; base_spd:=35; base_chrm:=60;
        g_hp:=10; g_mp:=4; g_atk:=3; g_def:=2; g_rec:=2; g_spd:=2; g_chrm:=5;
      ELSE
        base_hp:=200; base_mp:=50;  base_atk:=60; base_def:=50; base_rec:=20; base_spd:=30; base_chrm:=20;
        g_hp:=15; g_mp:=2; g_atk:=4; g_def:=4; g_rec:=1; g_spd:=2; g_chrm:=1;
    END CASE;

    -- 永続ボーナス = 5レベルごとの成長値
    perm_hp   := milestones * g_hp;
    perm_mp   := milestones * g_mp;
    perm_atk  := milestones * g_atk;
    perm_def  := milestones * g_def;
    perm_rec  := milestones * g_rec;
    perm_spd  := milestones * g_spd;
    perm_chrm := milestones * g_chrm;

    -- 通常ステータス = Lv1基礎 + (レベル-1) × 成長値
    new_max_hp  := base_hp  + (jlevel - 1) * g_hp;
    new_max_mp  := base_mp  + (jlevel - 1) * g_mp;
    new_atk     := base_atk + (jlevel - 1) * g_atk;
    new_def     := base_def + (jlevel - 1) * g_def;
    new_rec     := base_rec + (jlevel - 1) * g_rec;
    new_spd     := base_spd + (jlevel - 1) * g_spd;
    new_chrm    := base_chrm + (jlevel - 1) * g_chrm;

    -- 永続ボーナスを加算した最終ステータスに更新 + HP/MP全回復
    UPDATE characters
    SET
      max_hp         = new_max_hp + perm_hp,
      hp             = new_max_hp + perm_hp,
      max_mp         = new_max_mp + perm_mp,
      mp             = new_max_mp + perm_mp,
      attack         = new_atk + perm_atk,
      defense        = new_def + perm_def,
      recovery       = new_rec + perm_rec,
      speed          = new_spd + perm_spd,
      charm          = new_chrm + perm_chrm,
      permanent_bonus = jsonb_build_object(
        'hp',       perm_hp,
        'mp',       perm_mp,
        'attack',   perm_atk,
        'defense',  perm_def,
        'recovery', perm_rec,
        'speed',    perm_spd,
        'charm',    perm_chrm
      ),
      updated_at = NOW()
    WHERE id = r.id;

  END LOOP;
END $$;
