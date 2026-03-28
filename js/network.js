// [구조] 방 상태 관리자
export class RoomManager {
    constructor() {
        this.currentRoomCode = null;
        this.isHost = false;
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
    
    clearRoomState() {
        this.currentRoomCode = null;
        this.isHost = false;
    }
}

// [구조] 통신 클라이언트 (Supabase 래퍼 예정)
export class NetworkClient {
    constructor() {
        // 향후 Supabase 클라이언트 객체가 주입될 위치
        this.isConnected = false;
    }

    // [흐름] Supabase Realtime 채널 생성/접속 등 통신 흐름
    connectToRoom(roomCode) {
        console.log(`[Network] ${roomCode} 방 채널에 연결을 시도합니다...`);
        this.isConnected = true;
        // Supabase 통신 로직 추가 예정
    }

    disconnect() {
        console.log(`[Network] 채널 연결을 해제합니다.`);
        this.isConnected = false;
        // Supabase 통신 해제 로직 추가 예정
    }
}