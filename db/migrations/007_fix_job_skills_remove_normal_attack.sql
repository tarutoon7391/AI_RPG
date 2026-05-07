-- 007_fix_job_skills_remove_normal_attack.sql
-- job_skills テーブルから通常攻撃（skill_id=1）を削除する
-- 通常攻撃は「攻撃」コマンドで常に使用可能であり、
-- スキルとして選択できるべきではないため job_skills から取り除く

DELETE FROM job_skills WHERE skill_id = 1;
