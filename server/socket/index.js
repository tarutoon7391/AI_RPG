// Socket.io イベントハンドラ（骨格のみ）
//
// 受け口として用意しているイベント：
//   クライアント → サーバー
//     - room:create   : 部屋作成リクエスト
//     - room:join     : 部屋参加リクエスト
//     - room:leave    : 部屋退出リクエスト
//     - battle:action : バトル中の行動送信
//     - battle:ready  : バトル準備完了通知
//
//   サーバー → クライアント
//     - room:updated  : 部屋情報の更新
//     - battle:start  : バトル開始
//     - battle:turn   : ターン進行通知
//     - battle:end    : バトル終了
//     - player:joined : プレイヤー参加通知
//     - player:left   : プレイヤー退出通知
//
// 現時点ではビジネスロジックは未実装で、受信ログとプレースホルダ応答のみ行う。

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    const session = socket.request.session;
    const userId = session && session.userId;
    // eslint-disable-next-line no-console
    console.log(`[socket] 接続: socketId=${socket.id} userId=${userId || '匿名'}`);

    // ===== 部屋関連 =====
    socket.on('room:create', (payload, ack) => {
      // TODO: 部屋を新規作成し DB に保存する
      // payload 例: { mode: 'coop' | 'pvp', maxPlayers: 4 }
      // eslint-disable-next-line no-console
      console.log('[socket] room:create', payload);
      if (typeof ack === 'function') {
        ack({ ok: true, roomId: null, message: '未実装：room:create を受信しました' });
      }
    });

    socket.on('room:join', (payload, ack) => {
      // TODO: 部屋参加処理
      // payload 例: { roomId: 'xxx' }
      // eslint-disable-next-line no-console
      console.log('[socket] room:join', payload);
      if (payload && payload.roomId) {
        socket.join(`room:${payload.roomId}`);
        io.to(`room:${payload.roomId}`).emit('player:joined', {
          userId: userId || null,
          socketId: socket.id,
        });
        io.to(`room:${payload.roomId}`).emit('room:updated', {
          roomId: payload.roomId,
          message: '未実装：room:join 後の部屋情報更新',
        });
      }
      if (typeof ack === 'function') {
        ack({ ok: true, message: '未実装：room:join を受信しました' });
      }
    });

    socket.on('room:leave', (payload, ack) => {
      // TODO: 部屋退出処理
      // eslint-disable-next-line no-console
      console.log('[socket] room:leave', payload);
      if (payload && payload.roomId) {
        socket.leave(`room:${payload.roomId}`);
        io.to(`room:${payload.roomId}`).emit('player:left', {
          userId: userId || null,
          socketId: socket.id,
        });
        io.to(`room:${payload.roomId}`).emit('room:updated', {
          roomId: payload.roomId,
          message: '未実装：room:leave 後の部屋情報更新',
        });
      }
      if (typeof ack === 'function') {
        ack({ ok: true, message: '未実装：room:leave を受信しました' });
      }
    });

    // ===== バトル関連 =====
    socket.on('battle:action', (payload, ack) => {
      // TODO: 行動コマンドのバリデーションとキューイング
      // payload 例: { roomId, actorId, action: 'attack' | 'skill' | 'item' | 'recruit' | 'flee', targetId, skillId }
      // eslint-disable-next-line no-console
      console.log('[socket] battle:action', payload);
      if (typeof ack === 'function') {
        ack({ ok: true, message: '未実装：battle:action を受信しました' });
      }
    });

    socket.on('battle:ready', (payload, ack) => {
      // TODO: 全員 ready になったら battle:start を発行する
      // eslint-disable-next-line no-console
      console.log('[socket] battle:ready', payload);
      if (typeof ack === 'function') {
        ack({ ok: true, message: '未実装：battle:ready を受信しました' });
      }
    });

    socket.on('disconnect', (reason) => {
      // eslint-disable-next-line no-console
      console.log(`[socket] 切断: socketId=${socket.id} reason=${reason}`);
    });
  });
}

module.exports = registerSocketHandlers;
