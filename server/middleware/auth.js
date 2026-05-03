// 認証ミドルウェア
// セッションにユーザーIDが格納されているかをチェックする

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ error: '認証が必要です' });
}

module.exports = { requireAuth };
