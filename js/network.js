/**
 * js/network.js
 * 역할: [구조] Supabase 통신망 캡슐화
 */

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
        this.onGameEndedBroadcast = (finalScores) => {};
        this.onRematchRequested = (newRoomId) => {};
        this.onHostLeft = () => {};
        this.onConnectionError = () => {};
    }

    init(supabaseUrl, supabaseKey) {
        if (window.supabase) {
            this.supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
            console.log("통신 구조 초기화 완료.");
        } else {
            console.error("Supabase 라이브러리를 찾을 수 없습니다.");
        }
    }

    // async: 이전 채널을 완전히 정리한 후 새 채널 생성 보장
    async joinRoom(roomId, userId, initialState) {
        if (!this.supabase) return;
        if (this.currentChannel) {
            await this.leaveRoom();
        }

        this.myState = initialState;
        const channelName = `room_${roomId}`;

        this.currentChannel = this.supabase.channel(channelName, {
            config: {
                presence: { key: userId }, // presence 채널로 인식시키는 필수 옵션
                broadcast: { self: false }
            }
        });

        // presenceState()를 단일 진실의 원천으로 사용
        const refresh = () => {
            const state = this.currentChannel.presenceState();
            const newMap = new Map();

            for (const [, presences] of Object.entries(state)) {
                // null/undefined 방어 + 참조 복사로 외부 변형 방지
                const validPresence = presences.find(p => p && p.userId);
                if (!validPresence) continue;

                let p = { ...validPresence };

                // 내 상태 Optimistic 덮어쓰기
                if (this.myState && p.userId === this.myState.userId) {
                    p = { ...this.myState };
                }

                newMap.set(p.userId, p);
            }

            // 서버 반영 전 내 상태 강제 보장
            if (this.myState && !newMap.has(this.myState.userId)) {
                newMap.set(this.myState.userId, { ...this.myState });
            }

            this.players = newMap;
            this.onPlayerListUpdated(Array.from(this.players.values()));
        };

        this.currentChannel.on('presence', { event: 'sync' }, refresh);
        this.currentChannel.on('presence', { event: 'join' }, refresh);

        // refresh 후 players Map 기준으로 방장 존재 여부 확인
        this.currentChannel.on('presence', { event: 'leave' }, () => {
            refresh();
            const isHostStillHere = Array.from(this.players.values()).some(p => p.isHost === true);
            if (!isHostStillHere) {
                this.onHostLeft();
            }
        });

        this.currentChannel.on('broadcast', { event: 'score_update' }, (payload) => {
            if (payload?.payload) {
                this.onScoreUpdated(payload.payload.userId, payload.payload.score);
            }
        });
        this.currentChannel.on('broadcast', { event: 'game_start' }, (payload) => {
            if (payload?.payload) this.onGameStarted(payload.payload.seed);
        });
        // 방장 타이머 종료 시 멤버들에게 전달하는 게임 종료 신호
        this.currentChannel.on('broadcast', { event: 'game_end' }, (payload) => {
            if (payload?.payload) this.onGameEndedBroadcast(payload.payload.finalScores);
        });
        this.currentChannel.on('broadcast', { event: 'rematch_request' }, (payload) => {
            if (payload?.payload) this.onRematchRequested(payload.payload.newRoomId);
        });
        // presence leave 지연 보완: 방장이 직접 쏘는 즉시 신호
        this.currentChannel.on('broadcast', { event: 'host_leaving' }, () => {
            this.onHostLeft();
        });

        this.currentChannel.subscribe(async (status, err) => {
            if (status === 'SUBSCRIBED') {
                try {
                    // 즉시 로컬 렌더
                    this.players.set(initialState.userId, { ...initialState });
                    this.onPlayerListUpdated(Array.from(this.players.values()));

                    const result = await this.currentChannel.track(initialState);
                    if (result !== 'ok') console.error('Presence track 실패:', result);
                } catch (e) {
                    console.error('Presence track 중 예외:', e);
                }
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.error('채널 연결 실패:', status, err);
                await this.leaveRoom();
                this.onConnectionError();
            }
        });
    }

    async updatePresenceState(newState) {
        if (!this.currentChannel) return;
        this.myState = newState;
        this.players.set(newState.userId, { ...newState });
        this.onPlayerListUpdated(Array.from(this.players.values()));
        try {
            await this.currentChannel.track(newState);
        } catch (e) {
            console.error('Presence 업데이트 예외:', e);
        }
    }

    async leaveRoom() {
        if (this.currentChannel) {
            try {
                await this.currentChannel.untrack();
                await this.supabase.removeChannel(this.currentChannel);
            } catch (e) {
                console.error('채널 정리 중 예외:', e);
            }
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
            if (error) console.error('방 생성 DB 에러:', error);
            return !error;
        } catch (err) { console.error('방 생성 예외:', err); return false; }
    }

    async checkRoomDB(roomCode) {
        if (!this.supabase) return false;
        try {
            const { data, error } = await this.supabase.from('rooms').select('*').eq('room_code', roomCode).single();
            if (error) console.error('방 조회 DB 에러:', error);
            if (!data || data.status !== 'waiting') return false;
            return true;
        } catch (err) { console.error('방 조회 예외:', err); return false; }
    }

    async updateRoomStatusPlaying(roomCode) {
        if (!this.supabase) return;
        try {
            const { error } = await this.supabase.from('rooms').update({ status: 'playing' }).eq('room_code', roomCode);
            if (error) console.error('방 상태 업데이트 에러:', error);
        } catch (err) { console.error('방 상태 업데이트 예외:', err); }
    }

    async deleteRoomDB(roomCode) {
        if (!this.supabase || !roomCode) return;
        try {
            const { error } = await this.supabase.from('rooms').delete().eq('room_code', roomCode);
            if (error) console.error('방 삭제 DB 에러:', error);
        } catch (err) { console.error('방 삭제 예외:', err); }
    }

    // --- 브로드캐스트 전송 메서드 ---

    // 채널이 살아있는 동안 먼저 호출해야 멤버들이 즉시 수신
    sendHostLeaving() {
        if (!this.currentChannel) return;
        this.currentChannel.send({ type: 'broadcast', event: 'host_leaving', payload: {} });
    }

    // force=true: throttle 무시하고 즉시 전송 (게임 종료 시 최종 점수용)
    sendScore(userId, score, force = false) {
        if (!this.currentChannel) return;
        const now = Date.now();
        if (!force && now - this.lastScoreSentTime < this.scoreThrottleMs) return;
        this.currentChannel.send({ type: 'broadcast', event: 'score_update', payload: { userId, score } });
        this.lastScoreSentTime = now;
    }

    sendGameStart(seed) {
        if (!this.currentChannel) return;
        this.currentChannel.send({ type: 'broadcast', event: 'game_start', payload: { seed } });
    }

    // 방장 타이머 종료 시 멤버들에게 게임 종료 통보
    sendGameEnd(finalScores) {
        if (!this.currentChannel) return;
        this.currentChannel.send({ type: 'broadcast', event: 'game_end', payload: { finalScores } });
    }

    sendRematchRequest(newRoomId) {
        if (!this.currentChannel) return;
        this.currentChannel.send({ type: 'broadcast', event: 'rematch_request', payload: { newRoomId } });
    }
}

const networkManager = new NetworkClient();
