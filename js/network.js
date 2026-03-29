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
        this.leftPlayers = new Set(); // 🚀 [부활] 블랙리스트
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
        this.channel = null;
        this.myLastData = null;
        this.onSyncState = null;
        this.onGameStart = null;
        this.onForceNicknameReset = null;
        this.onPlayerLeft = null; // 🚀 [부활] 퇴장 알림 콜백
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
        this.channel.on('broadcast', { event: 'force_reset_nickname' }, (payload) => {
            if (this.onForceNicknameReset) this.onForceNicknameReset(payload.payload.targetId);
        });

        // 🚀 [부활] 확성기 수신 로직 추가
        this.channel.on('broadcast', { event: 'player_left' }, (payload) => {
            if (this.onPlayerLeft) this.onPlayerLeft(payload.payload.id);
        });

        this.channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                console.log(`[Network] ${roomCode} 채널 접속 완료`);

                if (myData.isHost) {
                    // 🚀 [조건 1] 방장: 접속 즉시 자신의 상태를 등록하여 방을 "생성"합니다.
                    await this.channel.track(this.myLastData);
                    resolve(true);
                } else {
                    // 🚀 [조건 2] 게스트: 접속 후 0.5초 대기하며 방장 존재 여부를 확인합니다.
                    setTimeout(async () => {
                        const state = this.channel.presenceState();
                        let hasHost = false;
                        for (const key in state) {
                            if (state[key].some(p => p.isHost && !p.isLeaving)) {
                                hasHost = true;
                                break;
                            }
                        }

                        if (hasHost) {
                            // 방장이 존재하면 정식으로 내 상태를 등록하고 입장 허가!
                            await this.channel.track(this.myLastData);
                            resolve(true);
                        } else {
                            // 방장이 없으면 튕겨냄 (유령방 접속 차단)
                            await this.channel.unsubscribe();
                            await window.supabase.removeChannel(this.channel);
                            this.channel = null;
                            this.myLastData = null;
                            reject(new Error('ROOM_NOT_FOUND'));
                        }
                    }, 500);
                }
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
    
    // 🚀 [부활] 내가 나가기 직전에 쏘는 다이렉트 확성기
    async broadcastPlayerLeft(targetId) {
        if (this.channel) {
            await this.channel.send({
                type: 'broadcast',
                event: 'player_left',
                payload: { id: targetId }
            });
        }
    }

    // 🚀 확성기를 쏘고 0.15초 대기 후 안전하게 퇴장
    async disconnect() {
        if (!this.channel) return;
        try {
            if (this.myLastData) {
                // 서버 동기화를 기다리지 않고 방 전체에 다이렉트 방송 발사!
                await this.broadcastPlayerLeft(this.myLastData.id);
                await new Promise(resolve => setTimeout(resolve, 150)); 
            }
            await this.channel.unsubscribe();
            await window.supabase.removeChannel(this.channel);
        } catch (error) {
            console.error('[Network] Disconnect Error:', error);
        } finally {
            this.channel = null;
            this.myLastData = null;
        }
    }
}