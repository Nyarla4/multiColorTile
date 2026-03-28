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
        // 1. 누군가 방에 들어왔을 때
        this.network.onPlayerJoined = (playerData) => {
            this.roomManager.addPlayer(playerData.id, playerData.isHost);
            this.ui.renderPlayers(this.roomManager.players, this.roomManager.myId);

            if (this.roomManager.isHost) {
                this.network.broadcastSyncState(this.roomManager.players);
            }
        };

        // 2. 누군가 준비 버튼을 눌렀을 때
        this.network.onPlayerReadyChanged = (data) => {
            this.roomManager.setReadyState(data.id, data.isReady);
            this.ui.renderPlayers(this.roomManager.players, this.roomManager.myId);
            if (this.roomManager.isHost) {
                this.network.broadcastSyncState(this.roomManager.players);
            }
        };

        // 3. 누군가 동기화를 요청했을 때 (내가 방장이면 전체 목록을 다시 뿌림)
        this.network.onSyncRequest = () => {
            if (this.roomManager.isHost) {
                this.network.broadcastSyncState(this.roomManager.players); // 방 전체 명단 쏴줌
            }
        };

        // 4. [새로운 흐름] 방장으로부터 전체 방 상태(명단)를 수신했을 때
        this.network.onSyncState = (playersData) => {
            // 참가자(Guest)만 방장의 데이터를 믿고 자신의 명단을 덮어씀
            if (!this.roomManager.isHost) {
                this.roomManager.syncPlayers(playersData);
                this.ui.renderPlayers(this.roomManager.players, this.roomManager.myId);
            }
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
        this.roomManager.addPlayer(this.roomManager.myId, false);
        
        // 내 데이터를 들고 채널 접속
        this.network.connectToRoom(code, { id: this.roomManager.myId, isHost: false });
        
        // 방장에게 방 상태 동기화 요청
        this.network.requestSync();

        this.ui.setupButtons(false);
        this.ui.renderPlayers(this.roomManager.players, this.roomManager.myId);
        this.ui.updateRoomView(this.roomManager.currentRoomCode, false);
        this.ui.switchScreen('screen-room');
    }

    handleReadyToggle() {
        if (this.roomManager.isHost) return; 
        
        this.roomManager.toggleReady(this.roomManager.myId);
        
        // [흐름 추가] 변경된 내 준비 상태를 방 전체에 브로드캐스트
        const me = this.roomManager.players.find(p => p.id === this.roomManager.myId);
        this.network.broadcastReady(me.id, me.isReady);
        
        this.ui.renderPlayers(this.roomManager.players, this.roomManager.myId);
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
    handleLeaveRoom() {
        this.network.disconnect();
        this.roomManager.clearRoomState();
        this.ui.clearInput();
        this.ui.switchScreen('screen-lobby');
    }
}

// 애플리케이션 실행
window.onload = () => {
    const app = new AppController();
};