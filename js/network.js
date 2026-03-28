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

// network.js 의 NetworkClient 클래스

export class NetworkClient {
    constructor() {
        this.channel = null;
        this.onSyncState = null;
    }

    connectToRoom(roomCode, myData) {
        this.channel = supabase.channel('room_' + roomCode, {
            config: { presence: { key: myData.id } },
        });

        this.channel.on('presence', { event: 'sync' }, () => {
            const state = this.channel.presenceState();
            const currentPlayers = [];

            for (const key in state) {
                const presenceArray = state[key];
                if (presenceArray.length > 0) {
                    // [핵심 해결] 유령이 섞여 있더라도, 무조건 배열의 맨 마지막(가장 최신) 상태를 가져옵니다!
                    const latestData = presenceArray[presenceArray.length - 1];
                    currentPlayers.push(latestData);
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
            await this.channel.untrack(); // 흔적 지우기 요청

            // [핵심 해결] 지우기 요청이 서버에 닿을 수 있도록 0.2초만 기다려줍니다 (유령 방지)
            await new Promise(resolve => setTimeout(resolve, 200));

            await supabase.removeChannel(this.channel);
            this.channel = null;
        }
    }
}