const SUPABASE_URL = 'https://mhoscqcewmrorfxcewsn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2e33xf0hNMg3sP4xNTIiwQ_HGhFFu12';
if (!window.supabase) throw new Error('[Network] Supabase SDK 로드 실패');
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// [구조] 방 상태 관리자
export class RoomManager {
    constructor() {
        this.currentRoomCode = null;
        this.isHost = false;
        this.myId = 'P_' + crypto.randomUUID().slice(0, 8);
        this.players = []; // 접속자 목록 배열
    }

    // [흐름] 데이터 처리
    generateRoomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    setRoomState(code, hostStatus) {
        this.currentRoomCode = code;
        this.isHost = hostStatus;
    }

    addPlayer(id, isHost) {
        if (!this.players.find(p => p.id === id)) {
            this.players.push({ id: id, isHost: isHost, isReady: false });
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

// network.js 내부의 NetworkClient 클래스를 아래 코드로 통째로 교체하세요.

export class NetworkClient {
    constructor() {
        this.channel = null;
        this.onSyncState = null;
        this.onGameStart = null; // [구조 추가] 게임 시작 이벤트 수신 콜백
        this.myLastData = null; // [구조 추가] 나의 가장 최신 상태를 기억해둡니다.
    }

    connectToRoom(roomCode, myData) {
        this.myLastData = myData;

        this.channel = supabase.channel('room_' + roomCode, {
            config: { presence: { key: myData.id } },
        });

        // 공통 함수로 분리
        const syncCurrentState = () => {
            const state = this.channel.presenceState();
            const currentPlayers = [];

            for (const key in state) {
                const presenceArray = state[key];
                if (presenceArray.length > 0) {
                    const latestData = presenceArray[presenceArray.length - 1];
                    if (!latestData.isLeaving) {
                        currentPlayers.push(latestData);
                    }
                }
            }

            if (this.onSyncState) this.onSyncState(currentPlayers);
        };

        // sync 와 leave 둘 다 같은 처리
        this.channel.on('presence', { event: 'sync' }, syncCurrentState);
        this.channel.on('presence', { event: 'leave' }, syncCurrentState); // ← 추가

        this.channel.on('broadcast', { event: 'game_start' }, (payload) => {
            if (this.onGameStart) this.onGameStart(payload.payload.seed);
        });

        this.channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                console.log(`[Network] Supabase ${roomCode} 채널 접속 완료`);
                await this.channel.track(this.myLastData);
            }
        });
    }

    async updateMyState(newData) {
        if (this.channel) {
            this.myLastData = newData; // 상태를 바꿀 때마다 내 최신 상태 갱신
            await this.channel.track(newData);
        }
    }
    
    // 🚀 [흐름 추가] 방장이 시드 배열을 담아 방 전체에 게임 시작을 알림
    async broadcastGameStart(seedData) {
        if (this.channel) {
            await this.channel.send({
                type: 'broadcast',
                event: 'game_start',
                payload: { seed: seedData }
            });
        }
    }

    async disconnect() {
        if (this.channel) {
            try {
                // 🚀 [핵심 로직] 통신을 끊기 직전, 다른 사람들에게 "나 진짜 나간다" 라고 확정 데이터를 쏴줍니다.
                if (this.myLastData) {
                    await this.channel.track({ ...this.myLastData, isLeaving: true });
                }

                // 이 확정 데이터가 서버와 다른 클라이언트에게 도달할 수 있도록 아주 잠깐(0.2초)만 숨을 고릅니다.
                await new Promise(resolve => setTimeout(resolve, 200));

                // 이후 안전하게 구독 취소 및 채널 삭제
                await this.channel.unsubscribe();
                await supabase.removeChannel(this.channel);
            } catch (error) {
                console.error("[Network] Disconnect Error:", error);
            } finally {
                this.channel = null;
                this.myLastData = null;
            }
        }
    }
}