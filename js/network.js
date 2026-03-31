const SUPABASE_URL = 'https://mhoscqcewmrorfxcewsn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2e33xf0hNMg3sP4xNTIiwQ_HGhFFu12';

if (!window.supabase) throw new Error('[Network] Supabase SDK 로드 실패. CDN 연결 확인 필요.');
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

export class RoomManager {
    constructor() {
        this.currentRoomCode = null;
        this.isHost = false;
        this.myId = 'P_' + crypto.randomUUID().slice(0, 8);
        this.myNickname = localStorage.getItem('tileclear_nickname') || this.myId;
        this.players = [];
        this.leftPlayers = new Set();
    }

    setNickname(name) {
        this.myNickname = name;
        localStorage.setItem('tileclear_nickname', name);
    }

    generateRoomCode() {
        return Math.random().toString(36).substring(2, 6).toUpperCase(); // 난수 생성 로직 단순화
    }

    setRoomState(code, isHost) {
        this.currentRoomCode = code;
        this.isHost = isHost;
    }

    addPlayer(id, isHost) {
        if (!this.players.some(p => p.id === id)) {
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

export class NetworkClient {
    constructor() {
        this.channel = null;
        this.myLastData = null;
        this.callbacks = {}; // 이벤트 콜백을 객체로 통합 관리
    }

    on(event, callback) {
        this.callbacks[event] = callback;
    }

    trigger(event, payload) {
        if (this.callbacks[event]) this.callbacks[event](payload);
    }

    connectToRoom(roomCode, myData) {
        return new Promise((resolve, reject) => {
            this.myLastData = myData;
            this.channel = supabase.channel(`room_${roomCode}`, {
                config: { presence: { key: myData.id } },
            });

            const syncCurrentState = () => {
                const state = this.channel.presenceState();
                const currentPlayers = Object.values(state)
                    .map(arr => arr.length > 0 ? arr[arr.length - 1] : null)
                    .filter(p => p && !p.isLeaving);
                this.trigger('syncState', currentPlayers);
            };

            this.channel.on('presence', { event: 'sync' }, syncCurrentState);
            this.channel.on('presence', { event: 'leave' }, syncCurrentState);
            this.channel.on('broadcast', { event: 'game_start' }, (p) => this.trigger('gameStart', p.payload.seed));
            this.channel.on('broadcast', { event: 'force_reset_nickname' }, (p) => this.trigger('forceNicknameReset', p.payload.targetId));
            this.channel.on('broadcast', { event: 'player_left' }, (p) => this.trigger('playerLeft', p.payload.id));
            this.channel.on('broadcast', { event: 'player_kicked' }, (p) => this.trigger('playerKicked', p.payload.targetId));

            this.channel.subscribe(async (status) => {
                if (status !== 'SUBSCRIBED') return;

                if (myData.isHost) {
                    await this.channel.track(this.myLastData);
                    return resolve(true);
                }

                let attempts = 0;
                const checkHostInterval = setInterval(async () => {
                    try {
                        attempts++;
                        const state = this.channel.presenceState();
                        const hasHost = Object.values(state).some(arr => arr.some(p => p.isHost && !p.isLeaving));

                        if (hasHost) {
                            clearInterval(checkHostInterval);
                            await this.channel.track(this.myLastData);
                            resolve(true);
                        } else if (attempts >= 15) {
                            clearInterval(checkHostInterval);
                            await this._cleanup();
                            reject(new Error('ROOM_NOT_FOUND'));
                        }
                    } catch (err) {
                        clearInterval(checkHostInterval);
                        reject(err);
                    }
                }, 100);
            });
        });
    }

    async _sendBroadcast(event, payload) {
        if (this.channel) {
            await this.channel.send({ type: 'broadcast', event, payload });
        }
    }

    broadcastKickPlayer(targetId) { return this._sendBroadcast('player_kicked', { targetId }); }
    broadcastGameStart(seed) { return this._sendBroadcast('game_start', { seed }); }
    broadcastForceNicknameReset(targetId) { return this._sendBroadcast('force_reset_nickname', { targetId }); }
    broadcastPlayerLeft(id) { return this._sendBroadcast('player_left', { id }); }

    async updateMyState(newData) {
        if (!this.channel) return;
        this.myLastData = newData;
        await this.channel.track(newData);
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

    async _cleanup() {
        await this.channel.unsubscribe();
        await supabase.removeChannel(this.channel);
        this.channel = null;
        this.myLastData = null;
    }

    async registerRoomToDB(roomCode) {
        try { await supabase.from('active_rooms').insert([{ room_code: roomCode }]); } catch (e) {}
    }

    async unregisterRoomFromDB(roomCode) {
        try { await supabase.from('active_rooms').delete().eq('room_code', roomCode); } catch (e) {}
    }

    async getRandomRoomFromDB() {
        try {
            const { data, error } = await supabase.from('active_rooms').select('room_code').limit(50);
            if (error || !data || data.length === 0) return null;
            return data[Math.floor(Math.random() * data.length)].room_code;
        } catch (e) { return null; }
    }

    unregisterRoomFromDBOnUnload(roomCode) {
        fetch(`${SUPABASE_URL}/rest/v1/active_rooms?room_code=eq.${roomCode}`, {
            method: 'DELETE',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
            keepalive: true
        }).catch(() => {});
    }
}