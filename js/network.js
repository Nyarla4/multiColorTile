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
}

const networkManager = new NetworkClient();