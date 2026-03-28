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

// [구조] 통신 클라이언트 (Supabase 래퍼 예정)
export class NetworkClient {
    constructor() {
        this.channel = null;
        this.onPlayerJoined = null;
        this.onPlayerReadyChanged = null;
        this.onSyncRequest = null;
        this.onSyncState = null;
    }

    connectToRoom(roomCode, myData) {
        this.channel = new BroadcastChannel('room_' + roomCode);
        console.log(`[Network] ${roomCode} 채널 접속 완료`);

        // 메시지 수신 흐름 (Router 역할)
        this.channel.onmessage = (event) => {
            const msg = event.data;
            switch (msg.type) {
                case 'JOIN':
                    if (this.onPlayerJoined) this.onPlayerJoined(msg.payload);
                    break;
                case 'READY':
                    if (this.onPlayerReadyChanged) this.onPlayerReadyChanged(msg.payload);
                    break;
                case 'SYNC_REQUEST':
                    if (this.onSyncRequest) this.onSyncRequest();
                    break;
                case 'SYNC_STATE':
                    if(this.onSyncState) this.onSyncState(msg.payload);
                    break;
            }
        };

        // 접속하자마자 내 정보를 방에 뿌림
        this.broadcastJoin(myData);
    }

    // [흐름] 데이터 발신 메서드들
    broadcastJoin(playerData) {
        if (this.channel) this.channel.postMessage({ type: 'JOIN', payload: playerData });
    }

    broadcastReady(id, isReady) {
        if (this.channel) this.channel.postMessage({ type: 'READY', payload: { id, isReady } });
    }

    broadcastSyncState(playersArray) {
        if(this.channel) this.channel.postMessage({ type: 'SYNC_STATE', payload: playersArray });
    }

    // 방장이 새로 들어온 사람에게 현재 방의 모든 플레이어 목록을 쏴줄 때 사용
    requestSync() {
        if (this.channel) this.channel.postMessage({ type: 'SYNC_REQUEST' });
    }

    disconnect() {
        if (this.channel) {
            this.channel.close();
            this.channel = null;
        }
    }
}