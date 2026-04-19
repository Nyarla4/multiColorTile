// 🚀 1. 서버 URL 동적 세팅 (로컬 vs 배포)
const SERVER_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://multicolortileserver.onrender.com'


// ============================================================================
// [구조] 방·플레이어 상태 관리자 (그대로 유지)
// ============================================================================
export class RoomManager {
    constructor() {
        this.currentRoomCode = null;
        this.isHost          = false;
        this.myId            = 'P_' + crypto.randomUUID().slice(0, 8);
        this.myNickname      = localStorage.getItem('tileclear_nickname') || this.myId;
        this.players         = [];
        this.leftPlayers     = new Set();
    }

    setNickname(name) {
        this.myNickname = name;
        localStorage.setItem('tileclear_nickname', name);
    }

    generateRoomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    setRoomState(code, isHost) {
        this.currentRoomCode = code;
        this.isHost          = isHost;
    }

    addPlayer(id, isHost) {
        if (!this.players.find(p => p.id === id)) {
            this.players.push({ id, nickname: this.myNickname, isHost, isReady: false });
        }
    }

    clearRoomState() {
        this.currentRoomCode = null;
        this.isHost          = false;
        this.players         = [];
        this.leftPlayers.clear();
        this.myId = 'P_' + crypto.randomUUID().slice(0, 8);
    }

    syncPlayers(playersData) {
        const oldPlayers = new Map(this.players.map(p => [p.id, p]));
        const newPlayersMap = new Map(playersData.map(p => [p.id, p]));

        let merged = playersData.filter(p => !this.leftPlayers.has(p.id)).map(p => {
            const old = oldPlayers.get(p.id);
            if (old) {
                if (old.history && old.history.length > 0) p.history = old.history;
                if (old.isPlaying && p.isPlaying && p.score === 0 && old.score > 0) p.score = old.score;
            }
            return p;
        });

        oldPlayers.forEach((old, id) => {
            if (old.isPlaying && !newPlayersMap.has(id)) {
                old.isLeaving = true;
                merged.push(old);
            }
        });

        this.players = merged;
    }

    markPlayerAsLeft(id) {
        this.leftPlayers.add(id);
        const player = this.players.find(p => p.id === id);
        
        if (player && player.isPlaying) {
            player.isLeaving = true;
        } else {
            this.players = this.players.filter(p => p.id !== id);
        }
    }

    cleanLeftPlayers() {
        this.players = this.players.filter(p => !this.leftPlayers.has(p.id));
    }
}


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