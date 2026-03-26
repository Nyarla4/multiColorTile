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

    // [흐름 수정] initialState 객체를 통째로 받아 추적(track)합니다.
    joinRoom(roomId, userId, initialState) {
        if (!this.supabase) return;
        if (this.currentChannel) this.leaveRoom();

        const channelName = `room_${roomId}`;
        this.currentChannel = this.supabase.channel(channelName, {
            config: {
                presence: { key: userId },
                broadcast: { self: false } // 내가 보낸 브로드캐스트는 내가 받지 않음 (방장 본인 시작 문제의 원인)
            }
        });

        this.currentChannel.on('presence', { event: 'sync' }, () => {
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
                // 초기 상태 전송
                await this.currentChannel.track(initialState);
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