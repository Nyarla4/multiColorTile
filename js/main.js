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
}

// [구조] 중앙 애플리케이션 컨트롤러
class AppController {
    constructor() {
        // 실행과 관계없이 모든 구조적 의존성을 여기서 결정하고 주입합니다.
        this.ui = new LobbyUI();
        this.roomManager = new RoomManager();
        this.network = new NetworkClient();
        
        this.bindEvents();
    }

    // [흐름] 이벤트 바인딩
    bindEvents() {
        document.getElementById('btn-create-room').addEventListener('click', () => this.handleCreateRoom());
        document.getElementById('btn-join-room').addEventListener('click', () => this.handleJoinRoom());
        document.getElementById('btn-leave-room').addEventListener('click', () => this.handleLeaveRoom());
    }

    // [흐름] 방 생성 로직
    handleCreateRoom() {
        const newCode = this.roomManager.generateRoomCode();
        this.roomManager.setRoomState(newCode, true);
        
        this.network.connectToRoom(newCode); // 네트워크 모듈에 처리 위임
        
        this.ui.updateRoomView(this.roomManager.currentRoomCode, this.roomManager.isHost);
        this.ui.switchScreen('screen-room');
    }

    // [흐름] 방 접속 로직
    handleJoinRoom() {
        const code = this.ui.getInputValue();
        if (code.length !== 4) {
            alert('4자리 방 코드를 정확히 입력해주세요.');
            return;
        }

        this.roomManager.setRoomState(code, false);
        this.network.connectToRoom(code); // 네트워크 모듈에 처리 위임
        
        this.ui.updateRoomView(this.roomManager.currentRoomCode, this.roomManager.isHost);
        this.ui.switchScreen('screen-room');
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