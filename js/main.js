import { GameConfig, Board, generateSeed } from './game.js';
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
        this.gameBoard = document.getElementById('game-board'); // [구조 추가]
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

    // 🚀 [흐름 추가] 전달받은 그리드 배열을 화면에 렌더링
    renderBoard(gridData, onClickCallback) {
        this.gameBoard.innerHTML = '';
        gridData.forEach((color, index) => {
            const cell = document.createElement('div');
            // 게임 타일 CSS 스타일링
            cell.style.width = '30px'; 
            cell.style.height = '30px';
            cell.style.boxSizing = 'border-box';
            cell.style.borderRadius = '4px';

            if (color) { // 색상이 있으면 타일
                cell.style.backgroundColor = color;
                cell.style.boxShadow = 'inset 0 0 5px rgba(0,0,0,0.2)';
            } else { // null 이면 빈 공간 (클릭 가능)
                cell.style.backgroundColor = '#eaeaea';
                cell.style.cursor = 'pointer';
                cell.addEventListener('click', () => onClickCallback(index));
            }
            this.gameBoard.appendChild(cell);
        });
    }
}

// [구조] 중앙 애플리케이션 컨트롤러
class AppController {
    constructor() {
       this.ui = new LobbyUI();
        this.roomManager = new RoomManager();
        this.network = new NetworkClient();
        this.board = null; // [구조 추가] 로컬 게임 보드 객체
        
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
       this.network.onSyncState = (playersData) => {
            console.log("[Network] 최신 명단 수신:", playersData);
            this.roomManager.syncPlayers(playersData);
            this.ui.renderPlayers(this.roomManager.players, this.roomManager.myId);
        };

        // 🚀 [흐름 추가] 참가자들이 방장으로부터 시드를 받았을 때 게임 시작
        this.network.onGameStart = (seed) => {
            console.log("[Game] 게임 시작 방송 수신. 보드를 생성합니다.");
            this.startGameProcess(seed);
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
        
        const desiredReadyState = !me.isReady;
        
        // 🚀 [해결] 서버에 보내기 전에 내 로컬 화면부터 즉시 갱신! (1~2초 답답함 해결)
        me.isReady = desiredReadyState;
        this.ui.renderPlayers(this.roomManager.players, this.roomManager.myId);
        
        // 서버에 상태 갱신 요청 (다른 사람들의 화면은 1~2초 뒤에 바뀜)
        this.network.updateMyState({
            id: this.roomManager.myId,
            isHost: false,
            isReady: desiredReadyState,
            updatedAt: Date.now() 
        });
    }

    handleGameStart() {
        // 방장 전용: 모든 참가자가 준비되었는지 확인
        const guests = this.roomManager.players.filter(p => !p.isHost);
        const allReady = guests.length > 0 && guests.every(p => p.isReady);

        if (!allReady && guests.length > 0) {
            alert("모든 참가자가 준비를 완료해야 시작할 수 있습니다.");
            return;
        }

        // 1. 방장이 게임 시드를 한 번만 생성
        const seed = generateSeed(GameConfig);
        
        // 2. 다른 사람들에게 시드를 전파 (Broadcast)
        this.network.broadcastGameStart(seed);
        
        // 3. 방장 자신도 로컬에서 게임 시작
        this.startGameProcess(seed);
    }

    // 🚀 [흐름 추가] 실제 게임 화면 전환 및 렌더링 프로세스
    startGameProcess(seed) {
        // UI 변경: 버튼 숨기고 상태 변경
        document.getElementById('btn-ready').style.display = 'none';
        document.getElementById('btn-start').style.display = 'none';
        document.getElementById('room-status').innerText = "게임 진행 중!";

        // 로컬 보드 객체 초기화 및 렌더링
        this.board = new Board(GameConfig);
        this.board.initializeWithSeed(seed);
        
        // 렌더링 호출 및 클릭 이벤트 연결
        this.ui.renderBoard(this.board.grid, (index) => this.handleCellClick(index));
    }

    // 🚀 [흐름 추가] 플레이어가 빈 공간을 클릭했을 때의 타일 파괴 로직
    handleCellClick(index) {
        if (!this.board) return;

        // game.js 의 직선 탐색 로직 호출
        const targetTiles = this.board.getMatchedTilesToDestroy(index);
        
        if (targetTiles.length > 0) {
            // 타일 파괴 (데이터 null 처리)
            targetTiles.forEach(idx => this.board.grid[idx] = null);
            
            // 파괴된 최신 상태로 화면 다시 그리기
            this.ui.renderBoard(this.board.grid, (idx) => this.handleCellClick(idx));
            
            // 추후 여기에 점수 획득 및 서버 동기화 로직이 들어갑니다.
            console.log(`${targetTiles.length}개 타일 파괴됨!`);
        }
    }

    // [흐름] 방 퇴장 로직
   async handleLeaveRoom() {
        console.log("[Lobby] 방 나가기 시도...");
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