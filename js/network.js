const SUPABASE_URL = 'https://mhoscqcewmrorfxcewsn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2e33xf0hNMg3sP4xNTIiwQ_HGhFFu12';

if (!window.supabase) throw new Error('[Network] Supabase SDK 로드 실패. CDN 연결 확인 필요.');
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


// [구조] 방·플레이어 상태 관리자
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
        this.players = playersData.filter(p => !this.leftPlayers.has(p.id));
    }

    markPlayerAsLeft(id) {
        this.leftPlayers.add(id);
        this.players = this.players.filter(p => p.id !== id);
    }
}


// [구조] Supabase 채널 통신 전담
export class NetworkClient {
    constructor() {
        this.channel              = null;
        this.myLastData           = null;
        this.onSyncState          = null;
        this.onGameStart          = null;
        this.onForceNicknameReset = null;
        this.onPlayerLeft         = null;
        this.onPlayerKicked = null; // 🚀 [추가] 추방 알림 콜백
    }

    // [흐름] 채널 접속 — Promise로 성공/실패를 명확히 반환
    connectToRoom(roomCode, myData) {
        return new Promise((resolve, reject) => {
            this.myLastData = myData;

            this.channel = supabase.channel('room_' + roomCode, {
                config: { presence: { key: myData.id } },
            });

            const syncCurrentState = () => {
                const state          = this.channel.presenceState();
                const currentPlayers = [];
                for (const key in state) {
                    const arr = state[key];
                    if (arr.length > 0) {
                        const latest = arr[arr.length - 1];
                        if (!latest.isLeaving) currentPlayers.push(latest);
                    }
                }
                if (this.onSyncState) this.onSyncState(currentPlayers);
            };

            this.channel.on('presence',  { event: 'sync'  }, syncCurrentState);
            this.channel.on('presence',  { event: 'leave' }, syncCurrentState);
            this.channel.on('broadcast', { event: 'game_start' }, (payload) => {
                if (this.onGameStart) this.onGameStart(payload.payload.seed);
            });
            this.channel.on('broadcast', { event: 'force_reset_nickname' }, (payload) => {
                if (this.onForceNicknameReset) this.onForceNicknameReset(payload.payload.targetId);
            });
            this.channel.on('broadcast', { event: 'player_left' }, (payload) => {
                if (this.onPlayerLeft) this.onPlayerLeft(payload.payload.id);
            });
            // 🚀 [추가] 방장이 쏜 추방 방송 수신
            this.channel.on('broadcast', { event: 'player_kicked' }, (payload) => {
                if (this.onPlayerKicked) this.onPlayerKicked(payload.payload.targetId);
            });

            this.channel.subscribe(async (status) => {
                if (status !== 'SUBSCRIBED') return;

                console.log(`[Network] ${roomCode} 채널 접속 완료`);

                if (myData.isHost) {
                    await this.channel.track(this.myLastData);
                    resolve(true);
                    return;
                }

                // 게스트: 방장 존재 확인 (최대 1.5초, 100ms 간격)
                let attempts = 0;
                const CHECK_INTERVAL = 100;
                const MAX_ATTEMPTS   = 15;

                const checkHostInterval = setInterval(async () => {
                    try {
                        attempts++;
                        const state   = this.channel.presenceState();
                        const hasHost = Object.values(state).some(arr =>
                            arr.some(p => p.isHost && !p.isLeaving)
                        );

                        if (hasHost) {
                            clearInterval(checkHostInterval);
                            await this.channel.track(this.myLastData);
                            resolve(true);
                        } else if (attempts >= MAX_ATTEMPTS) {
                            clearInterval(checkHostInterval);
                            await this._cleanup();
                            reject(new Error('ROOM_NOT_FOUND'));
                        }
                    } catch (err) {
                        clearInterval(checkHostInterval);
                        reject(err);
                    }
                }, CHECK_INTERVAL);
            });
        });
    }

    // 🚀 [추가] 방장이 특정 대상을 추방하는 방송 전송
    async broadcastKickPlayer(targetId) {
        if (this.channel) {
            await this.channel.send({
                type:    'broadcast',
                event:   'player_kicked',
                payload: { targetId }
            });
        }
    }

    async updateMyState(newData) {
        if (!this.channel) return;
        this.myLastData = newData;
        await this.channel.track(newData);
    }

    async broadcastGameStart(seedData) {
        if (!this.channel) return;
        await this.channel.send({
            type:    'broadcast',
            event:   'game_start',
            payload: { seed: seedData },
        });
    }

    async broadcastForceNicknameReset(targetId) {
        if (!this.channel) return;
        await this.channel.send({
            type:    'broadcast',
            event:   'force_reset_nickname',
            payload: { targetId },
        });
    }

    async broadcastPlayerLeft(id) {
        if (!this.channel) return;
        await this.channel.send({
            type:    'broadcast',
            event:   'player_left',
            payload: { id },
        });
    }

    async disconnect() {
        if (!this.channel) return;
        try {
            if (this.myLastData) {
                await this.broadcastPlayerLeft(this.myLastData.id);
                await new Promise(resolve => setTimeout(resolve, 150));
            }
            await this._cleanup();
        } catch (error) {
            console.error('[Network] Disconnect Error:', error);
        }
    }

    // [내부] 채널 구독 해지 및 참조 초기화
    async _cleanup() {
        await this.channel.unsubscribe();
        await supabase.removeChannel(this.channel);
        this.channel    = null;
        this.myLastData = null;
    }
}