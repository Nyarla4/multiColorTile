class NetworkClient {
    constructor() {
        this.supabase = null;
        this.currentChannel = null;
        this.players = new Map();
        this.myState = null;

        this.lastScoreSentTime = 0;
        this.scoreThrottleMs = 500;

        this.onPlayerListUpdated = (players) => {};
        this.onScoreUpdated = (userId, newScore) => {};
        this.onGameStarted = (seed) => {};
        this.onRematchRequested = (newRoomId) => {};
        this.onHostLeft = () => {};
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

        this.myState = initialState;

        const channelName = `room_${roomId}`;
        // presence key 제거 — payload의 userId로 직접 식별
        this.currentChannel = this.supabase.channel(channelName, {
            config: { broadcast: { self: false } }
        });

        // presenceState()를 단일 진실의 원천으로 사용하는 헬퍼
        const refresh = () => {
            const state = this.currentChannel.presenceState();
            const newMap = new Map();
            for (const [, presences] of Object.entries(state)) {
                const p = presences[0];
                if (p?.userId) newMap.set(p.userId, p);
            }
            // 서버 반영 전 내 상태가 빠졌을 때 보정
            if (this.myState && !newMap.has(this.myState.userId)) {
                newMap.set(this.myState.userId, this.myState);
            }
            this.players = newMap;
            this.onPlayerListUpdated(Array.from(this.players.values()));
        };

        this.currentChannel.on('presence', { event: 'sync' }, refresh);
        this.currentChannel.on('presence', { event: 'join' }, refresh);

        // leave: refresh 전에 방장 여부 체크 (refresh 후엔 이미 제거됨)
        this.currentChannel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
            const hostLeft = leftPresences.some(p => p.isHost === true);
            refresh();
            if (hostLeft) this.onHostLeft();
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
        // presence leave 신뢰성 보완: 방장이 직접 보내는 즉시 감지 신호
        this.currentChannel.on('broadcast', { event: 'host_leaving' }, () => {
            this.onHostLeft();
        });

        this.currentChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                // 즉시 로컬 렌더 후 track 호출
                this.players.set(initialState.userId, initialState);
                this.onPlayerListUpdated(Array.from(this.players.values()));
                const result = await this.currentChannel.track(initialState);
                if (result !== 'ok') {
                    console.error('Presence track 실패:', result);
                }
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.error('채널 연결 실패:', status);
            }
        });
    }

    async updatePresenceState(newState) {
        if (!this.currentChannel) return;
        this.myState = newState;
        this.players.set(newState.userId, newState);
        this.onPlayerListUpdated(Array.from(this.players.values()));
        await this.currentChannel.track(newState);
    }

    leaveRoom() {
        if (this.currentChannel) {
            this.currentChannel.untrack();     // presence 즉시 제거
            this.currentChannel.unsubscribe();
            this.currentChannel = null;
            this.players.clear();
            this.myState = null;
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

    async deleteRoomDB(roomCode) {
        if (!this.supabase || !roomCode) return;
        await this.supabase.from('rooms').delete().eq('room_code', roomCode);
    }

    // --- 브로드캐스트 전송 메서드 ---
    // 채널이 살아있는 동안 먼저 호출해야 멤버들이 즉시 수신
    sendHostLeaving() {
        if (!this.currentChannel) return;
        this.currentChannel.send({ type: 'broadcast', event: 'host_leaving', payload: {} });
    }

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
