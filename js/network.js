// ============================================================================
// [흐름] Socket.io 통신 전담 기사
// ============================================================================
export class NetworkClient {
    constructor() {
        this.socket               = null;
        this.myLastData           = null;
        this.onSyncState          = null;
        this.onGameStart          = null;
        this.onForceNicknameReset = null;
        this.onPlayerLeft         = null;
        this.onPlayerKicked       = null;
        this.onSyncScore          = null; 
        this.onSyncHistory        = null;
    }

    _setupListeners() {
        if (!this.socket) return;

        this.socket.on("sync_state", (playersData) => {
            if (this.onSyncState) this.onSyncState(playersData);
        });
        this.socket.on("player_left", (payload) => {
            if (this.onPlayerLeft) this.onPlayerLeft(payload.id);
        });
        this.socket.on("game_start", (p) => {
            if (this.onGameStart) this.onGameStart(p.seed);
        });
        this.socket.on("force_reset_nickname", (p) => {
            if (this.onForceNicknameReset) this.onForceNicknameReset(p.targetId);
        });
        this.socket.on("player_kicked", (p) => {
            if (this.onPlayerKicked) this.onPlayerKicked(p.targetId);
        });
        this.socket.on("sync_score", (p) => {
            if (this.onSyncScore) this.onSyncScore(p.id, p.score);
        });
        this.socket.on("sync_history", (p) => {
            if (this.onSyncHistory) this.onSyncHistory(p.id, p.score, p.history);
        });
    }

    connectToRoom(roomCode, myData) {
        return new Promise((resolve, reject) => {
            if (this.socket) {
                this.socket.disconnect();
                this.socket = null; 
            }

            this.socket = window.io(SERVER_URL);
            this.myLastData = myData;

            this._setupListeners();

            this.socket.on("connect", () => {
                this.socket.emit("join_room", { roomCode, playerData: myData }, (res) => {
                    if (res.success) {
                        console.log(`[Network] ${roomCode} 방 접속 완료`);
                        resolve(true);
                    } else {
                        this.socket.disconnect();
                        this.socket = null;
                        reject(new Error('JOIN_FAILED'));
                    }
                });
            });

            this.socket.on("connect_error", () => {
                this.socket.disconnect();
                this.socket = null;
                reject(new Error('TIMED_OUT'));
            });
        });
    }

    updateMyState(newData) {
        if (!this.socket) return;
        this.myLastData = newData;
        this.socket.emit("update_state", newData);
    }

    _broadcast(event, payload) {
        if (!this.socket) return;
        this.socket.emit("broadcast", { event, payload });
    }

    broadcastGameStart(seedData)          { this._broadcast("game_start", { seed: seedData }); }
    broadcastForceNicknameReset(targetId) { this._broadcast("force_reset_nickname", { targetId }); }
    broadcastKickPlayer(targetId)         { this._broadcast("player_kicked", { targetId }); }
    broadcastScore(id, score)             { this._broadcast("sync_score", { id, score }); }
    broadcastHistory(id, score, history)  { this._broadcast("sync_history", { id, score, history }); }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    async registerRoomToDB(roomCode) { return; }
    async unregisterRoomFromDB(roomCode) { return; }
    unregisterRoomFromDBOnUnload(roomCode) { return; }

    getRandomRoomFromDB() {
        return new Promise((resolve) => {
            const tempSocket = window.io(SERVER_URL);
            let settled = false;

            tempSocket.on("connect_error", () => {
                if (settled) return;
                settled = true;
                
                tempSocket.disconnect();
                console.error("[Network] 랜덤 방 찾기 실패: 서버 응답 없음");
                resolve(null); 
            });

            tempSocket.on("connect", () => {
                // 🚀 [추가] 서버가 연결은 됐는데 응답을 주지 않고 기절하는 경우 (무한 대기 방지)
                const timer = setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    
                    tempSocket.disconnect();
                    console.error("[Network] 랜덤 방 찾기 실패: 서버 응답 시간 초과 (5초)");
                    resolve(null);
                }, 5000); 

                tempSocket.emit("get_random_room", (res) => {
                    clearTimeout(timer); // 🚀 정상 응답 시 타이머 해제
                    if (settled) return;
                    settled = true;
                    
                    tempSocket.disconnect();
                    resolve(res.roomCode);
                });
            });
        });
    }
}