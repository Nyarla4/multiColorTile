import { RoomManager, NetworkClient } from './network.js';
// 향후 game.js의 Board, GameConfig 등을 가져와 게임 시작 흐름을 추가합니다.

// [구조] UI 조작 전담
class LobbyUI {
    constructor() {
        this.screenLobby = document.getElementById('screen-lobby');
        this.screenRoom = document.getElementById('screen-room');
        this.inputRoomCode = document.getElementById('input-room-code');
        this.roomTitle = document.getElementById('room-title');
        this.roomStatus = document.getElementById('room-status');
        this.playerList = document.getElementById('player-list');
        this.btnReady = document.getElementById('btn-ready');
        this.btnStart = document.getElementById('btn-start');
    }

    switchScreen(screenId) {
        this.screenLobby.classList.remove('active');
        this.screenRoom.classList.remove('active');
        document.getElementById(screenId).classList.add('active');
    }

    updateRoomView(roomCode, isHost) {
        this.roomTitle.innerText = `방 코드: [ ${roomCode} ]`;
        this.roomStatus.innerText = isHost
            ? "당신은 방장입니다. 다른 플레이어를 기다리는 중..."
            : "방에 접속했습니다. 시작을 기다리는 중...";
    }

    getInputValue() { return this.inputRoomCode.value.trim().toUpperCase(); }
    clearInput() { this.inputRoomCode.value = ''; }

    renderPlayers(players, myId) {
        this.playerList.innerHTML = '';
        players.forEach(p => {
            const li = document.createElement('li');
            li.style.padding = "5px 0";

            let text = p.id;
            if (p.id === myId) text += " (나)";
            if (p.isHost) text += " 👑 방장";
            else text += p.isReady ? " ✅ 준비완료" : " ⏳ 대기중";

            li.innerText = text;
            this.playerList.appendChild(li);
        });
    }

    // [흐름] 권한에 따른 버튼 노출 분기
    setupButtons(isHost) {
        if (isHost) {
            this.btnReady.style.display = 'none';
            this.btnStart.style.display = 'block';
        } else {
            this.btnReady.style.display = 'block';
            this.btnStart.style.display = 'none';
        }
    }
}

// [구조] 중앙 애플리케이션 컨트롤러
class AppController {
    constructor() {
       this.ui = new LobbyUI();
        this.roomManager = new RoomManager();
        this.network = new NetworkClient();
        
        this.bindEvents();
        this.setupNetworkCallbacks();
    }

    // [흐름] 이벤트 바인딩
    bindEvents() {
        document.getElementById('btn-create-room').addEventListener('click', () => this.handleCreateRoom());
        document.getElementById('btn-join-room').addEventListener('click', () => this.handleJoinRoom());
        document.getElementById('btn-leave-room').addEventListener('click', () => this.handleLeaveRoom());
        document.getElementById('btn-ready').addEventListener('click', () => this.handleReadyToggle());
        document.getElementById('btn-start').addEventListener('click', () => this.handleGameStart());
    }

    setupNetworkCallbacks() {
        // [흐름] Supabase가 최신 명단을 주면, 무조건 내 RoomManager를 덮어쓰고 화면을 새로 그림
        this.network.onSyncState = (playersData) => {
            this.roomManager.syncPlayers(playersData);
            this.ui.renderPlayers(this.roomManager.players, this.roomManager.myId);
        };
    }

    // [흐름] 방 생성 로직
    handleCreateRoom() {
        const newCode = this.roomManager.generateRoomCode();
        this.roomManager.setRoomState(newCode, true);
        this.roomManager.addPlayer(this.roomManager.myId, true);
        
        // 내 데이터를 들고 채널 접속
        this.network.connectToRoom(newCode, { id: this.roomManager.myId, isHost: true });
        
        this.ui.setupButtons(true);
        this.ui.renderPlayers(this.roomManager.players, this.roomManager.myId);
        this.ui.updateRoomView(this.roomManager.currentRoomCode, true);
        this.ui.switchScreen('screen-room');
    }

    // [흐름] 방 접속 로직
    handleJoinRoom() {
        const code = this.ui.getInputValue();
        if (code.length !== 4) { alert('4자리 방 코드를 정확히 입력해주세요.'); return; }

        this.roomManager.setRoomState(code, false);

        // 내 데이터를 들고 Supabase 채널 접속
        this.network.connectToRoom(code, {
            id: this.roomManager.myId,
            isHost: false,
            isReady: false
        });

        // ❌ 아래 코드가 남아있었다면 삭제해 주세요! (에러의 원인)
        // this.network.requestSync(); 

        this.ui.setupButtons(false);
        this.ui.updateRoomView(this.roomManager.currentRoomCode, false);
        this.ui.switchScreen('screen-room'); // 이제 여기까지 무사히 흐름이 도달합니다!
    }

    handleReadyToggle() {
        if (this.roomManager.isHost) return; 
        
        const me = this.roomManager.players.find(p => p.id === this.roomManager.myId);
        if (!me) return;

        const newReadyState = !me.isReady;

        me.isReady = newReadyState;
        this.ui.renderPlayers(this.roomManager.players, this.roomManager.myId);
        
        this.network.updateMyState({
            id: this.roomManager.myId,
            isHost: false,
            isReady: newReadyState
        });
    }

    handleGameStart() {
        // 모든 참가자가 준비되었는지 확인
        const guests = this.roomManager.players.filter(p => !p.isHost);
        const allReady = guests.length > 0 && guests.every(p => p.isReady);

        if (!allReady && guests.length > 0) {
            alert("모든 참가자가 준비를 완료해야 시작할 수 있습니다.");
            return;
        }

        console.log("게임 시작 흐름 트리거!");
        // 추후 여기서 game.js의 BoardGenerator를 호출하고 보드 화면으로 전환
    }

    // [흐름] 방 퇴장 로직
    async handleLeaveRoom() {
        await this.network.disconnect();
        this.roomManager.clearRoomState();
        this.ui.clearInput();
        this.ui.switchScreen('screen-lobby');
    }
}

// 애플리케이션 실행
window.onload = () => {
    const app = new AppController();
};