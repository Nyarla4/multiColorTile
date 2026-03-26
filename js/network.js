/**
 * js/network.js
 * 역할: [구조] Supabase 통신망 캡슐화.
 */

class NetworkClient {
    constructor() {
        this.supabase = null;
        this.currentChannel = null;
        this.players = new Map(); 

        this.lastScoreSentTime = 0;
        this.scoreThrottleMs = 500; 

        // [구조] 콜백 훅
        this.onPlayerListUpdated = (players) => {}; 
        this.onScoreUpdated = (userId, newScore) => {}; 
        this.onGameStarted = (seed) => {}; 
        this.onRematchRequested = (newRoomId) => {}; 
    }

    init(supabaseUrl, supabaseKey) {
        if (window.supabase) {
            this.supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
            console.log("통신 구조 초기화 완료.");
        }
    }

    joinRoom(roomId, userId, initialState) {
        if (!this.supabase) return;
        if (this.currentChannel) this.leaveRoom();

        const channelName = `room_${roomId}`;
        this.currentChannel = this.supabase.channel(channelName, {
            config: {
                presence: { key: userId },
                broadcast: { self: false }
            }
        });

        // ✅ sync: 채널 최초 연결 및 전체 상태 갱신 시
        this.currentChannel.on('presence', { event: 'sync' }, () => {
            const newState = this.currentChannel.presenceState();
            this.players.clear();
            for (const [key, stateArray] of Object.entries(newState)) {
                this.players.set(key, stateArray[0]);
            }
            this.onPlayerListUpdated(Array.from(this.players.values()));
        });

        // ✅ 버그 2 수정: 타인 입장 감지 (sync가 안 잡히는 케이스 보완)
        this.currentChannel.on('presence', { event: 'join' }, () => {
            const newState = this.currentChannel.presenceState();
            this.players.clear();
            for (const [key, stateArray] of Object.entries(newState)) {
                this.players.set(key, stateArray[0]);
            }
            this.onPlayerListUpdated(Array.from(this.players.values()));
        });

        // ✅ leave 이벤트도 처리
        this.currentChannel.on('presence', { event: 'leave' }, () => {
            const newState = this.currentChannel.presenceState();
            this.players.clear();
            for (const [key, stateArray] of Object.entries(newState)) {
                this.players.set(key, stateArray[0]);
            }
            this.onPlayerListUpdated(Array.from(this.players.values()));
        });

        this.currentChannel.on('broadcast', { event: 'score_update' }, (payload) => {
            this.onScoreUpdated(payload.payload.userId, payload.payload.score);
        });
        this.currentChannel.on('broadcast', { event: 'game_start' }, (payload) => {
            this.onGameStarted(payload.payload.seed);
        });
        this.currentChannel.on('broadcast', { event: 'rematch_request' }, (payload) => {
            this.onRematchRequested(payload.payload.newRoomId);
        });

        this.currentChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await this.currentChannel.track(initialState);

                // ✅ 버그 1 수정: track 직후 즉시 로컬 렌더링 (sync 대기 없이)
                this.players.set(initialState.userId, initialState);
                this.onPlayerListUpdated(Array.from(this.players.values()));
            }
        });
    }

    // [흐름 수정] 내 상태 변경 시 화면 즉각 반영
    async updatePresenceState(newState) {
        if (!this.currentChannel) return;
        
        // 1. [로컬 흐름 강제 업데이트] 서버 응답을 기다리지 않고 내 화면부터 즉시 변경
        this.players.set(newState.userId, newState);
        this.onPlayerListUpdated(Array.from(this.players.values()));

        // 2. [서버 동기화] 변경된 상태 브로드캐스트
        await this.currentChannel.track(newState);
    }

    leaveRoom() {
        if (this.currentChannel) {
            this.currentChannel.unsubscribe();
            this.currentChannel = null;
            this.players.clear();
        }
    }

    // --- DB 통신 메서드 ---
    async createRoomDB(roomCode, hostId) {
        if (!this.supabase) return false;
        try {
            const { error } = await this.supabase.from('rooms').insert([{ room_code: roomCode, host_id: hostId, status: 'waiting' }]);
            return !error;
        } catch (err) { return false; }
    }

    async checkRoomDB(roomCode) {
        if (!this.supabase) return false;
        try {
            const { data, error } = await this.supabase.from('rooms').select('*').eq('room_code', roomCode).single();
            if (error || !data || data.status !== 'waiting') return false;
            return true;
        } catch (err) { return false; }
    }

    async updateRoomStatusPlaying(roomCode) {
        if (!this.supabase) return;
        await this.supabase.from('rooms').update({ status: 'playing' }).eq('room_code', roomCode);
    }

    // --- 브로드캐스트 전송 메서드 ---
    sendScore(userId, score) {
        if (!this.currentChannel) return;
        const now = Date.now();
        if (now - this.lastScoreSentTime < this.scoreThrottleMs) return;
        this.currentChannel.send({ type: 'broadcast', event: 'score_update', payload: { userId, score } });
        this.lastScoreSentTime = now;
    }

    sendGameStart(seed) {
        if (!this.currentChannel) return;
        this.currentChannel.send({ type: 'broadcast', event: 'game_start', payload: { seed } });
    }

    sendRematchRequest(newRoomId) {
        if (!this.currentChannel) return;
        this.currentChannel.send({ type: 'broadcast', event: 'rematch_request', payload: { newRoomId } });
    }
}

const networkManager = new NetworkClient();