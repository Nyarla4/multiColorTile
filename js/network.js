class NetworkClient {
    constructor() {
        this.supabase = null;
        this.currentChannel = null;
        this.players = new Map();
        this.myState = null; // ★ 추가: 내 상태 보관용

        this.lastScoreSentTime = 0;
        this.scoreThrottleMs = 500;

        this.onPlayerListUpdated = (players) => {};
        this.onScoreUpdated = (userId, newScore) => {};
        this.onGameStarted = (seed) => {};
        this.onRematchRequested = (newRoomId) => {};
        this.onHostLeft = () => {}; // ★ 추가: 방장 퇴장 콜백
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

        this.myState = initialState; // ★ 추가: 내 상태 저장

        const channelName = `room_${roomId}`;
        this.currentChannel = this.supabase.channel(channelName, {
            config: {
                presence: { key: userId },
                broadcast: { self: false }
            }
        });

        // ★ 수정: sync는 전체 초기화 전용. 빈 상태면 내 상태 보정
        this.currentChannel.on('presence', { event: 'sync' }, () => {
            const newState = this.currentChannel.presenceState();
            this.players.clear();
            for (const [key, stateArray] of Object.entries(newState)) {
                this.players.set(key, stateArray[0]);
            }
            // sync가 빈 상태로 와도 내 정보는 유지
            if (this.myState && !this.players.has(this.myState.userId)) {
                this.players.set(this.myState.userId, this.myState);
            }
            this.onPlayerListUpdated(Array.from(this.players.values()));
        });

        // ★ 수정: join 페이로드(newPresences)를 직접 사용 — presenceState() 타이밍 문제 회피
        this.currentChannel.on('presence', { event: 'join' }, ({ newPresences }) => {
            newPresences.forEach(p => this.players.set(p.userId, p));
            this.onPlayerListUpdated(Array.from(this.players.values()));
        });

        // ★ 수정: leave 페이로드(leftPresences)를 직접 사용 + 방장 퇴장 감지
        this.currentChannel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
            leftPresences.forEach(p => {
                this.players.delete(p.userId);
                if (p.isHost) {
                    this.onHostLeft(); // ★ 방장이 나갔으면 콜백 호출
                }
            });
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
                // ★ 수정: 로컬 반영을 track보다 먼저 — 화면이 즉시 뜸
                this.players.set(initialState.userId, initialState);
                this.onPlayerListUpdated(Array.from(this.players.values()));
                await this.currentChannel.track(initialState);
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.error('채널 연결 실패:', status);
            }
        });
    }

    async updatePresenceState(newState) {
        if (!this.currentChannel) return;
        this.myState = newState; // ★ 추가: 내 상태 최신화
        this.players.set(newState.userId, newState);
        this.onPlayerListUpdated(Array.from(this.players.values()));
        await this.currentChannel.track(newState);
    }

    leaveRoom() {
        if (this.currentChannel) {
            this.currentChannel.unsubscribe();
            this.currentChannel = null;
            this.players.clear();
            this.myState = null; // ★ 추가
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

    // ★ 추가: 방장 퇴장 시 방 삭제
    async deleteRoomDB(roomCode) {
        if (!this.supabase || !roomCode) return;
        await this.supabase.from('rooms').delete().eq('room_code', roomCode);
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