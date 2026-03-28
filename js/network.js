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
        this.onSyncState = null; // Supabase가 명단을 갱신해줄 때 호출할 콜백
        // (onPlayerJoined, onPlayerReadyChanged 등은 Presence로 통합되어 더 이상 필요 없습니다)
    }

    connectToRoom(roomCode, myData) {
        // 1. 채널 생성
        this.channel = supabase.channel('room_' + roomCode);

        // 2. [흐름] 누군가 들어오거나 나가거나 상태를 바꿀 때마다 자동 실행
        this.channel.on('presence', { event: 'sync' }, () => {
            const state = this.channel.presenceState();
            const currentPlayers = [];
            
            // Supabase의 Presence 데이터를 우리가 쓰는 배열 형태로 변환
            for (const id in state) {
                currentPlayers.push(state[id][0]); // 가장 최신 상태 추출
            }
            
            // 컨트롤러로 최신 명단 전달
            if (this.onSyncState) this.onSyncState(currentPlayers);
        });

        // 3. 채널 구독 및 내 데이터 등록
        this.channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                console.log(`[Network] Supabase ${roomCode} 채널 접속 완료`);
                // 내 초기 상태(myData)를 Presence에 등록
                await this.channel.track(myData);
            }
        });
    }

    // [흐름] 내 준비 상태가 바뀌었을 때 Presence 정보 업데이트
    async updateMyState(newData) {
        if (this.channel) {
            await this.channel.track(newData);
        }
    }

    disconnect() {
        if (this.channel) {
            supabase.removeChannel(this.channel);
            this.channel = null;
        }
    }
}