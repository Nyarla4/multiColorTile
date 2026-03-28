const SUPABASE_URL = 'https://mhoscqcewmrorfxcewsn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2e33xf0hNMg3sP4xNTIiwQ_HGhFFu12';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// [구조] 방 상태 관리자
export class RoomManager {
    constructor() {
        this.currentRoomCode = null;
        this.isHost = false;
        this.myId = 'Player_' + Math.floor(Math.random() * 1000);
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

    removePlayer(id) {
        this.players = this.players.filter(p => p.id !== id);
    }

    setReadyState(id, isReady) {
        const player = this.players.find(p => p.id === id);
        if (player) player.isReady = isReady;
    }

    toggleReady(id) {
        const player = this.players.find(p => p.id === id);
        if (player && !player.isHost) {
            player.isReady = !player.isReady;
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

export class NetworkClient {
    constructor() {
        this.channel = null;
        this.onSyncState = null; 
    }

    connectToRoom(roomCode, myData) {
        // [핵심 변경점] 랜덤 ID 대신 내 ID를 고유 키(key)로 강제 지정합니다.
        // 이렇게 하면 중복 접속이나 유령 플레이어 현상을 완벽하게 방지할 수 있습니다.
        this.channel = supabase.channel('room_' + roomCode, {
            config: {
                presence: {
                    key: myData.id, 
                },
            },
        });

        this.channel.on('presence', { event: 'sync' }, () => {
            const state = this.channel.presenceState();
            const currentPlayers = [];
            
            // state 구조가 { 'Player_123': [{...}], 'Player_456': [{...}] } 형태로 바뀝니다.
            for (const key in state) {
                if (state[key].length > 0) {
                    currentPlayers.push(state[key][0]); // 항상 최신 상태만 추출
                }
            }
            
            if (this.onSyncState) this.onSyncState(currentPlayers);
        });

        this.channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                console.log(`[Network] Supabase ${roomCode} 채널 접속 완료`);
                await this.channel.track(myData);
            }
        });
    }

    async updateMyState(newData) {
        if (this.channel) {
            await this.channel.track(newData);
        }
    }

    async disconnect() {
        if (this.channel) {
            await this.channel.untrack(); // 서버에 즉시 내 흔적 삭제 요청
            await supabase.removeChannel(this.channel);
            this.channel = null;
        }
    }
}