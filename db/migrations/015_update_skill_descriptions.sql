-- 015_update_skill_descriptions.sql
-- 初級職スキル説明文を最新仕様に更新

UPDATE skills
SET
  name = CASE id
    WHEN 4 THEN '氷結斬り'
    WHEN 5 THEN '嵐斬り'
    WHEN 6 THEN '聖剣閃'
    ELSE name
  END,
  description = CASE id
    WHEN 2 THEN '無属性の強力な単体攻撃'
    WHEN 20 THEN 'そのターン敵全員の攻撃を自分に集める'
    WHEN 3 THEN '火属性の単体攻撃'
    WHEN 8 THEN '自身の防御力を3ターン上昇'
    WHEN 4 THEN '水属性の単体攻撃'
    WHEN 9 THEN '自身の会心率を3ターン上昇'
    WHEN 5 THEN '木属性の単体攻撃'
    WHEN 6 THEN '光属性の単体攻撃'
    WHEN 7 THEN '闇属性の単体攻撃'
    WHEN 10 THEN '自身のHP20%を消費する超強力な単体攻撃'

    WHEN 21 THEN '無属性の強力な単体魔法攻撃'
    WHEN 22 THEN '自身の攻撃力を3ターン上昇'
    WHEN 23 THEN '火属性の単体魔法攻撃'
    WHEN 24 THEN '敵単体の防御力を2ターン低下'
    WHEN 25 THEN '水属性の単体魔法攻撃'
    WHEN 26 THEN '無属性の全体魔法攻撃'
    WHEN 27 THEN '木属性の単体魔法攻撃'
    WHEN 28 THEN '光属性の単体魔法攻撃'
    WHEN 29 THEN '闇属性の単体魔法攻撃'
    WHEN 30 THEN 'MP大消費の超強力な単体魔法攻撃'

    WHEN 31 THEN '無属性の単体魔法攻撃'
    WHEN 32 THEN '味方単体のHPを回復'
    WHEN 33 THEN '火属性の単体魔法攻撃'
    WHEN 34 THEN '味方単体に毎ターンHP回復効果を3ターン付与'
    WHEN 35 THEN '水属性の単体魔法攻撃'
    WHEN 36 THEN '味方全体の防御力を3ターン上昇'
    WHEN 37 THEN '木属性の単体魔法攻撃'
    WHEN 38 THEN '光属性の単体魔法攻撃'
    WHEN 39 THEN '闇属性の単体魔法攻撃'
    WHEN 40 THEN '味方全体のHPを回復'

    WHEN 41 THEN '無属性の単体攻撃'
    WHEN 42 THEN '敵全体の命中率を2ターン低下'
    WHEN 43 THEN '火属性の単体攻撃'
    WHEN 44 THEN '敵単体に毒を付与'
    WHEN 45 THEN '水属性の単体攻撃'
    WHEN 46 THEN '会心率+20%の単体攻撃'
    WHEN 47 THEN '木属性の単体攻撃'
    WHEN 48 THEN '光属性の単体攻撃'
    WHEN 49 THEN '闇属性の単体攻撃'
    WHEN 50 THEN '無属性のランダム3回攻撃'

    WHEN 51 THEN '無属性の単体攻撃'
    WHEN 52 THEN '自身の回避率を3ターン上昇'
    WHEN 53 THEN '火属性の単体攻撃'
    WHEN 54 THEN '敵単体の素早さを2ターン低下'
    WHEN 55 THEN '水属性の単体攻撃'
    WHEN 56 THEN '自身の素早さを3ターン上昇'
    WHEN 57 THEN '木属性の単体攻撃'
    WHEN 58 THEN '光属性の単体攻撃'
    WHEN 59 THEN '闇属性の単体攻撃'
    WHEN 60 THEN '無属性の全体攻撃＋毒付与'

    WHEN 61 THEN '無属性の単体攻撃'
    WHEN 62 THEN '次の攻撃の威力を大幅上昇'
    WHEN 63 THEN '火属性の単体攻撃'
    WHEN 64 THEN '無属性の全体物理攻撃'
    WHEN 65 THEN '水属性の単体攻撃'
    WHEN 66 THEN '敵単体の防御力を2ターン低下'
    WHEN 67 THEN '木属性の単体攻撃'
    WHEN 68 THEN '光属性の単体攻撃'
    WHEN 69 THEN '闇属性の単体攻撃'
    WHEN 70 THEN '単体攻撃＋敵の攻撃力を低下'

    WHEN 71 THEN '無属性の単体攻撃'
    WHEN 72 THEN '味方モンスター1体の次の攻撃威力を上昇'
    WHEN 73 THEN '火属性の単体攻撃'
    WHEN 74 THEN '自身と選択したモンスターが攻撃'
    WHEN 75 THEN '水属性の単体攻撃'
    WHEN 76 THEN '敵単体の行動を1ターン封じる'
    WHEN 77 THEN '木属性の単体攻撃'
    WHEN 78 THEN '光属性の単体攻撃'
    WHEN 79 THEN '闇属性の単体攻撃'
    WHEN 80 THEN '味方モンスター全体の素早さを3ターン上昇'
    ELSE description
  END
WHERE id IN (
  2,3,4,5,6,7,8,9,10,20,
  21,22,23,24,25,26,27,28,29,30,
  31,32,33,34,35,36,37,38,39,40,
  41,42,43,44,45,46,47,48,49,50,
  51,52,53,54,55,56,57,58,59,60,
  61,62,63,64,65,66,67,68,69,70,
  71,72,73,74,75,76,77,78,79,80
);
