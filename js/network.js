/**
 * js/network.js
 * 역할: [구조] Supabase 통신망 캡슐화. 외부(main.js)에서 콜백을 주입받아 [흐름]을 위임.
 * 원칙: DOM 조작 코드가 섞여서는 안 됩니다.
 */

class NetworkClient {
    constructor() {
        this.supabase = null;
        this.currentChannel = null;
        this.players = new Map(); 

        // [흐름 제어용 구조] 점수 전송 Throttling 기준
        this.lastScoreSentTime = 0;
        this.scoreThrottleMs = 500; 

        // [구조] 외부 주입용 콜백 훅
        this.onPlayerListUpdated = (players) => {}; 
        this.onScoreUpdated = (userId, newScore) => {}; 
        this.onGameStarted = (seed) => {}; 
        this.onRematchRequested = (newRoomId) => {}; 
    }

    init(supabaseUrl, supabaseKey) {
        if (window.supabase) {
            this.supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
            console.log("통신 구조 초기화 완료.");
        } else {
            console.error("Supabase 라이브러리를 로드하지 못했습니다.");
        }
    }

    // [흐름] 채널 접속 및 이벤트 리스너 등록
    joinRoom(roomId, nickname, userId) {
        if (!this.supabase) return;
        
        if (this.currentChannel) {
            this.leaveRoom();
        }

        const channelName = `room_${roomId}`;
        this.currentChannel = this.supabase.channel(channelName, {
            config: {
                presence: { key: userId },
                broadcast: { self: false }
            }
        });

        // 수신 흐름 위임
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
                await this.currentChannel.track({
                    userId: userId,
                    nickname: nickname,
                    score: 0,
                    isReady: false
                });
            }
        });
    }

    leaveRoom() {
        if (this.currentChannel) {
            this.currentChannel.unsubscribe();
            this.currentChannel = null;
            this.players.clear();
        }
    }

    // [흐름] 데이터 브로드캐스트
    sendScore(userId, score) {
        if (!this.currentChannel) return;
        const now = Date.now();
        if (now - this.lastScoreSentTime < this.scoreThrottleMs) return;

        this.currentChannel.send({
            type: 'broadcast', event: 'score_update', payload: { userId, score }
        });
        this.lastScoreSentTime = now;
    }

    sendGameStart(seed) {
        if (!this.currentChannel) return;
        this.currentChannel.send({
            type: 'broadcast', event: 'game_start', payload: { seed }
        });
    }

    sendRematchRequest(newRoomId) {
        if (!this.currentChannel) return;
        this.currentChannel.send({
            type: 'broadcast', event: 'rematch_request', payload: { newRoomId }
        });
    }

    // [흐름] DB에 방 정보 생성 (방장 전용)
    async createRoomDB(roomCode, hostId) {
        if (!this.supabase) return false;
        try {
            const { error } = await this.supabase
                .from('rooms')
                .insert([{ room_code: roomCode, host_id: hostId, status: 'waiting' }]);
            
            if (error) {
                console.error("방 생성 실패:", error);
                return false;
            }
            return true;
        } catch (err) {
            return false;
        }
    }

    // [흐름] DB에서 방 코드 유효성 검증 (참여자 전용)
    async checkRoomDB(roomCode) {
        if (!this.supabase) return false;
        try {
            const { data, error } = await this.supabase
                .from('rooms')
                .select('*')
                .eq('room_code', roomCode)
                .single();

            if (error || !data) {
                console.error("방 찾을 수 없음:", error);
                return false;
            }
            if (data.status !== 'waiting') {
                console.error("이미 게임이 시작된 방입니다.");
                return false;
            }
            return true;
        } catch (err) {
            return false;
        }
    }

    // [흐름] 게임 시작 시 DB 상태 업데이트 (목록에서 안 보이게)
    async updateRoomStatusPlaying(roomCode) {
        if (!this.supabase) return;
        await this.supabase.from('rooms').update({ status: 'playing' }).eq('room_code', roomCode);
    }
}

const networkManager = new NetworkClient();