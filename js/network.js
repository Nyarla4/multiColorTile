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
        const oldPlayers = new Map(this.players.map(p => [p.id, p]));
        const newPlayersMap = new Map(playersData.map(p => [p.id, p]));

        let merged = playersData.filter(p=> !this.leftPlayers.has(p.id)).map(p=>{
            const old = oldPlayers.get(p.id);
            if(old){
                if(old.history && old.history.length > 0) p.history = old.history;
                if(old.isPlaying && p.isPlaying && p.score === 0 && old.score > 0) p.score = old.score;
            }
            return p;
        });

        // 🚀 [핵심 수정] 통신이 끊겼더라도, 게임에 참여했던 유저(isPlaying)는 '기록 보존'을 위해 지우지 않고 냅둡니다!
        oldPlayers.forEach((old, id) => {
            if (old.isPlaying && !newPlayersMap.has(id)) {
                old.isLeaving = true; // 화면에 나갔다는 표시(취소선)를 띄우기 위해 상태만 변경
                merged.push(old);
            }
        });

        this.players = merged;
    }

    markPlayerAsLeft(id) {
        this.leftPlayers.add(id);
        const player = this.players.find(p => p.id === id);
        
        if (player && player.isPlaying) {
            // 🚀 대기실이 아닌 게임/결과창에서는 배열에서 지우지 않고 취소선 처리만 합니다.
            player.isLeaving = true;
        } else {
            // 대기실에 있던 유저면 미련 없이 바로 지웁니다.
            this.players = this.players.filter(p => p.id !== id);
        }
    }

    // 🚀 [추가] 대기실로 복귀할 때, 기록용으로 남겨뒀던 나간 유저들을 비로소 일괄 청소합니다.
    cleanLeftPlayers() {
        this.players = this.players.filter(p => !this.leftPlayers.has(p.id));
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
        this.onPlayerKicked       = null;
        
        // 🚀 [추가] Broadcast용 콜백 변수
        this.onSyncScore          = null; 
        this.onSyncHistory        = null;
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
            this.channel.on('broadcast', { event: 'player_kicked' }, (payload) => {
                if (this.onPlayerKicked) this.onPlayerKicked(payload.payload.targetId);
            });

            // 🚀 [추가] 점수와 리플레이를 무전기(Broadcast)로 수신받는 흐름
            this.channel.on('broadcast', { event: 'sync_score' }, (payload) => {
                if (this.onSyncScore) this.onSyncScore(payload.payload.id, payload.payload.score);
            });
            this.channel.on('broadcast', { event: 'sync_history' }, (payload) => {
                if (this.onSyncHistory) this.onSyncHistory(payload.payload.id, payload.payload.score, payload.payload.history);
            });

            this.channel.subscribe(async (status) => {
                if (status !== 'SUBSCRIBED') {
                    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        // 🚀 [핵심 수정] 실패했을 때 무한 대기하지 말고, 에러를 뱉어내게(reject) 만듭니다!
                        console.error('[Network] 채널 구독 실패:', status);
                        await this._cleanup();
                        reject(new Error(status));
                    }
                    else {
                        return;
                    }
                }
                
                if (!this.channel) return;
                
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

    // 🚀 [추가] 방장이 방을 만들 때 DB에 방 코드 등록
    async registerRoomToDB(roomCode) {
        try {
            await supabase.from('active_rooms').insert([{ room_code: roomCode }]);
        } catch (e) { console.error('DB 등록 실패:', e); }
    }

    // 🚀 [추가] 게임이 시작되거나 방장이 나갈 때 DB에서 방 코드 삭제
    async unregisterRoomFromDB(roomCode) {
        try {
            await supabase.from('active_rooms').delete().eq('room_code', roomCode);
        } catch (e) { console.error('DB 삭제 실패:', e); }
    }

    // 🚀 [추가] DB에서 무작위 방 코드 하나 가져오기
    async getRandomRoomFromDB() {
        try {
            // 최대 50개의 활성 방을 가져와서 그 중 하나를 랜덤으로 뽑습니다.
            const { data, error } = await supabase.from('active_rooms').select('room_code').limit(50);
            if (error || !data || data.length === 0) return null;
            
            const randomIndex = Math.floor(Math.random() * data.length);
            return data[randomIndex].room_code;
        } catch (e) { 
            console.error('랜덤 방 찾기 실패:', e); 
            return null; 
        }
    }

    // 🚀 [추가] 브라우저 종료/새로고침 시 방 코드를 끝까지 책임지고 지우는 메서드
    unregisterRoomFromDBOnUnload(roomCode) {
        // Supabase SDK가 아닌 브라우저 내장 fetch를 사용합니다.
        const url = `${SUPABASE_URL}/rest/v1/active_rooms?room_code=eq.${roomCode}`;
        
        fetch(url, {
            method: 'DELETE',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            },
            keepalive: true // 🚀 핵심: 탭이 닫혀도 브라우저가 백그라운드에서 이 요청을 끝까지 전송함
        }).catch(e => console.error('강제 종료 DB 삭제 실패:', e));
    }

    // 🚀 [추가] 실시간 점수를 무전기로 쏘는 메서드 (빠름)
    async broadcastScore(id, score) {
        if (!this.channel) return;
        await this.channel.send({
            type: 'broadcast',
            event: 'sync_score',
            payload: { id, score }
        });
    }

    // 🚀 [추가] 무거운 리플레이를 무전기로 쏘는 메서드 (용량 제한 널널함)
    async broadcastHistory(id, score, history) {
        if (!this.channel) return;
        await this.channel.send({
            type: 'broadcast',
            event: 'sync_history',
            payload: { id, score, history }
        });
    }
}