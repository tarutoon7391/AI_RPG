// シンプルなインメモリレートリミッター
// keyごとに一定時間内のリクエスト回数を制限する

function createRateLimiter({ windowMs, maxRequests, keyGenerator }) {
  const records = new Map();

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const key = typeof keyGenerator === 'function'
      ? keyGenerator(req)
      : (req.ip || 'unknown');

    const record = records.get(key);
    if (!record || now >= record.resetAt) {
      records.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (record.count >= maxRequests) {
      return res.status(429).json({ error: 'リクエストが多すぎます。しばらく待って再試行してください。' });
    }

    record.count += 1;
    return next();
  };
}

module.exports = { createRateLimiter };
