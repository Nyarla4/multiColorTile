const SUPABASE_URL = 'https://mhoscqcewmrorfxcewsn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2e33xf0hNMg3sP4xNTIiwQ_HGhFFu12';

if (!window.supabase) throw new Error('[Network] Supabase SDK 로드 실패. CDN 연결 확인 필요.');
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


// [구조] 방·플레이어 상태 관리자
export class RoomManager {
    constructor() {
        this.currentRoomCode = null;
        this.isHost = false;
        this.myId = 'P_' + crypto.randomUUID().slice(0, 8);
        this.myNickname = localStorage.getItem('tileclear_nickname') || this.myId;
        this.players = [];
    }

    // [흐름] 닉네임 저장 (유효성 검사는 호출부에서 처리)
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
        this.isHost = isHost;
    }

    addPlayer(id, isHost) {
        if (!this.players.find(p => p.id === id)) {
            this.players.push({ id, nickname: this.myNickname, isHost, isReady: false });
        }
    }

    clearRoomState() {
        this.currentRoomCode = null;
        this.isHost = false;
        this.players = [];
    }

    syncPlayers(playersData) {
        this.players = [...playersData];
    }
}


// [구조] Supabase 채널 통신 전담
export class NetworkClient {
    constructor() {
        this.channel = null;
        this.myLastData = null;
        this.onSyncState = null;
        this.onGameStart = null;

        this.onForceNicknameReset = null;//닉네임 초기화 콜백
    }

    connectToRoom(roomCode, myData) {
        this.myLastData = myData;

        this.channel = supabase.channel('room_' + roomCode, {
            config: { presence: { key: myData.id } },
        });

        const syncCurrentState = () => {
            const state = this.channel.presenceState();
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

        this.channel.on('presence', { event: 'sync' }, syncCurrentState);
        this.channel.on('presence', { event: 'leave' }, syncCurrentState);
        this.channel.on('broadcast', { event: 'game_start' }, (payload) => {
            if (this.onGameStart) this.onGameStart(payload.payload.seed);
        });

        // 🚀 [흐름 추가] 방장의 "닉네임 초기화" 확성기 방송 수신
        this.channel.on('broadcast', { event: 'force_reset_nickname' }, (payload) => {
            if (this.onForceNicknameReset) this.onForceNicknameReset(payload.payload.targetId);
        });

        this.channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                console.log(`[Network] ${roomCode} 채널 접속 완료`);
                await this.channel.track(this.myLastData);
            }
        });
    }

    async updateMyState(newData) {
        if (!this.channel) return;
        this.myLastData = newData;
        await this.channel.track(newData);
    }

    async broadcastGameStart(seedData) {
        if (!this.channel) return;
        await this.channel.send({
            type: 'broadcast',
            event: 'game_start',
            payload: { seed: seedData },
        });
    }

    // 🚀 [흐름 추가] 방장이 특정 대상에게 닉네임 초기화를 명령하는 방송 전송
    async broadcastForceNicknameReset(targetId) {
        if (this.channel) {
            await this.channel.send({
                type: 'broadcast',
                event: 'force_reset_nickname',
                payload: { targetId: targetId }
            });
        }
    }

    async disconnect() {
        if (!this.channel) return;
        try {
            if (this.myLastData) {
                await this.channel.track({ ...this.myLastData, isLeaving: true });
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            await this.channel.unsubscribe();
            await supabase.removeAllChannels();
        } catch (error) {
            console.error('[Network] Disconnect Error:', error);
        } finally {
            this.channel = null;
            this.myLastData = null;
        }
    }
}