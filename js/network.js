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

    // 채널 연결을 Promise로 반환하여 UI 흐름에서 await 가능하도록 구성
    async joinRoom(roomId, userId, initialState) {
        if (!this.supabase) return false;
        if (this.currentChannel) {
            await this.leaveRoom();
        }

        this.myState = initialState;
        const channelName = `room_${roomId}`;

        this.currentChannel = this.supabase.channel(channelName, {
            config: {
                presence: { key: userId },
                broadcast: { self: false }
            }
        });

        return new Promise(async (resolve) => {
            const refresh = () => {
                const state = this.currentChannel.presenceState();
                const newMap = new Map();

                for (const [, presences] of Object.entries(state)) {
                    const validPresence = presences.find(p => p && p.userId);
                    if (!validPresence) continue;

                    let p = { ...validPresence };
                    if (this.myState && p.userId === this.myState.userId) {
                        p = { ...this.myState };
                    }
                    newMap.set(p.userId, p);
                }

                if (this.myState && !newMap.has(this.myState.userId)) {
                    newMap.set(this.myState.userId, { ...this.myState });
                }

                this.players = newMap;
                this.onPlayerListUpdated(Array.from(this.players.values()));
            };

            // [구조] 이벤트 리스너 체이닝으로 유실 방지
            this.currentChannel
                .on('presence', { event: 'sync' }, refresh)
                .on('presence', { event: 'join' }, refresh)
                .on('presence', { event: 'leave' }, () => {
                    refresh();
                    const isHostStillHere = Array.from(this.players.values()).some(p => p.isHost === true);
                    if (!isHostStillHere) {
                        this.onHostLeft();
                    }
                })
                .on('broadcast', { event: 'score_update' }, (payload) => {
                    if (payload?.payload) this.onScoreUpdated(payload.payload.userId, payload.payload.score);
                })
                .on('broadcast', { event: 'game_start' }, (payload) => {
                    if (payload?.payload) this.onGameStarted(payload.payload.seed);
                })
                .on('broadcast', { event: 'game_end' }, (payload) => {
                    if (payload?.payload) this.onGameEndedBroadcast(payload.payload.finalScores);
                })
                .on('broadcast', { event: 'rematch_request' }, (payload) => {
                    if (payload?.payload) this.onRematchRequested(payload.payload.newRoomId);
                })
                .on('broadcast', { event: 'host_leaving' }, () => {
                    this.onHostLeft();
                })
                .subscribe(async (status, err) => {
                    if (status === 'SUBSCRIBED') {
                        try {
                            this.players.set(initialState.userId, { ...initialState });
                            this.onPlayerListUpdated(Array.from(this.players.values()));

                            const result = await this.currentChannel.track(initialState);
                            if (result !== 'ok') console.error('Presence track 실패:', result);
                            resolve(true);
                        } catch (e) {
                            console.error('Presence track 중 예외:', e);
                            resolve(false);
                        }
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        console.error('채널 연결 실패:', status, err);
                        await this.leaveRoom();
                        this.onConnectionError();
                        resolve(false);
                    }
                });
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
        try { await this.supabase.from('rooms').update({ status: 'playing' }).eq('room_code', roomCode); } catch (err) {}
    }

    async deleteRoomDB(roomCode) {
        if (!this.supabase || !roomCode) return;
        try { await this.supabase.from('rooms').delete().eq('room_code', roomCode); } catch (err) {}
    }

    sendHostLeaving() {
        if (this.currentChannel) this.currentChannel.send({ type: 'broadcast', event: 'host_leaving', payload: {} });
    }

    sendScore(userId, score, force = false) {
        if (!this.currentChannel) return;
        const now = Date.now();
        if (!force && now - this.lastScoreSentTime < this.scoreThrottleMs) return;
        this.currentChannel.send({ type: 'broadcast', event: 'score_update', payload: { userId, score } });
        this.lastScoreSentTime = now;
    }

    sendGameStart(seed) {
        if (this.currentChannel) this.currentChannel.send({ type: 'broadcast', event: 'game_start', payload: { seed } });
    }

    sendGameEnd(finalScores) {
        if (this.currentChannel) this.currentChannel.send({ type: 'broadcast', event: 'game_end', payload: { finalScores } });
    }

    sendRematchRequest(newRoomId) {
        if (this.currentChannel) this.currentChannel.send({ type: 'broadcast', event: 'rematch_request', payload: { newRoomId } });
    }
}

const networkManager = new NetworkClient();