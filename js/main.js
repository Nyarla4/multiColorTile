import { GameConfig, Board, generateSeed, ScoreTimer } from './game.js';
import { RoomManager, NetworkClient } from './network.js';
// 향후 game.js의 Board, GameConfig 등을 가져와 게임 시작 흐름을 추가합니다.

// [구조] UI 조작 전담
class LobbyUI {
    constructor() {
        this.screenLobby = document.getElementById('screen-lobby');
        this.screenRoom = document.getElementById('screen-room');
        this.screenGame = document.getElementById('screen-game'); // 🚀 [구조 연동] 새로 추가된 게임 화면
        
        this.inputRoomCode = document.getElementById('input-room-code');
        this.roomTitle = document.getElementById('room-title');
        this.roomStatus = document.getElementById('room-status');
        this.playerList = document.getElementById('player-list');
        this.btnReady = document.getElementById('btn-ready');
        this.btnStart = document.getElementById('btn-start');
        
        this.gameInfo = document.getElementById('game-info');
        this.uiTime = document.getElementById('ui-time');
        this.uiScore = document.getElementById('ui-score');
        this.leaderboard = document.getElementById('leaderboard');
        this.gameBoard = document.getElementById('game-board');
    }

    switchScreen(screenId) {
        this.screenLobby.classList.remove('active');
        this.screenRoom.classList.remove('active');
        this.screenGame.classList.remove('active'); 
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

    updateStats(time, score) {
        this.uiTime.innerText = `Time: ${time}`;
        this.uiScore.innerText = `Score: ${score}`;
    }

    // 🚀 [흐름] 점수 기반으로 내림차순 정렬하여 순위표 렌더링
    renderLeaderboard(players) {
        const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
        this.leaderboard.innerHTML = '<strong style="display:block; margin-bottom:5px;">🏆 실시간 순위</strong>';

        sorted.forEach((p, index) => {
            const row = document.createElement('div');
            row.innerText = `${index + 1}등: ${p.id} - ${p.score || 0}점`;
            if (p.isLeaving) row.style.textDecoration = 'line-through'; // 나간 사람 취소선 처리
            this.leaderboard.appendChild(row);
        });
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
        this.scoreTimer = null; // 🚀 [구조 추가] 타이머 객체
        this.isGameRunning = false; // 🚀 [상태 추가] 게임 진행 여부

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
            this.roomManager.syncPlayers(playersData);

            // 🚀 [흐름 분기] 게임 중이면 순위표를 갱신하고, 대기실이면 명단을 갱신합니다.
            if (this.isGameRunning) {
                this.ui.renderLeaderboard(this.roomManager.players);
            } else {
                this.ui.renderPlayers(this.roomManager.players, this.roomManager.myId);
            }
        };

        this.network.onGameStart = (seed) => {
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
        this.isGameRunning = true;
        this.board = new Board(GameConfig);
        this.board.initializeWithSeed(seed);
        this.scoreTimer = new ScoreTimer(GameConfig);
        
        // 내 초기 점수를 0점으로 세팅하고, 준비(isReady) 상태를 강제로 해제합니다. (다음 게임을 위해)
        const me = this.roomManager.players.find(p => p.id === this.roomManager.myId);
        if (me) {
            this.network.updateMyState({ ...me, score: 0, isReady: false, updatedAt: Date.now() });
        }

        this.ui.updateStats(this.scoreTimer.time, this.scoreTimer.score);
        this.ui.renderBoard(this.board.grid, (index) => this.handleCellClick(index));
        
        // 요소들을 일일이 숨기는 대신, 깔끔하게 화면 통째로 전환!
        this.ui.switchScreen('screen-game');
        
        this.scoreTimer.intervalId = setInterval(() => this.gameLoop(), 1000);
    }

    // 🚀 [흐름] 메인 게임 루프 (타이머 차감)
    gameLoop() {
        if (!this.isGameRunning) return;

        const timeLeft = this.scoreTimer.tick();
        this.ui.updateStats(timeLeft, this.scoreTimer.score);

        if (this.scoreTimer.isTimeUp()) {
            this.endGame();
        }
    }

    // 🚀 [흐름] 타일 클릭 시 점수 획득 및 동기화
    handleCellClick(index) {
        if (!this.board || !this.isGameRunning) return;

        const targetTiles = this.board.getMatchedTilesToDestroy(index);

        if (targetTiles.length > 0) {
            // 타일 파괴
            targetTiles.forEach(idx => this.board.grid[idx] = null);

            // 점수 증가 (타일 1개당 1점) 및 UI 갱신
            this.scoreTimer.addScore(targetTiles.length * 1);
            this.ui.updateStats(this.scoreTimer.time, this.scoreTimer.score);
            this.ui.renderBoard(this.board.grid, (idx) => this.handleCellClick(idx));

            // 🚀 [핵심 흐름] 점수가 올랐으니 내 최신 상태를 Supabase에 즉시 전송!
            const me = this.roomManager.players.find(p => p.id === this.roomManager.myId);
            if (me) {
                this.network.updateMyState({ ...me, score: this.scoreTimer.score, updatedAt: Date.now() });
            }
        }
    }

    // 🚀 [흐름] 게임 종료 처리
    endGame() {
        this.isGameRunning = false;
        clearInterval(this.scoreTimer.intervalId);
        
        // 콜백 제거하여 클릭 막기
        this.ui.renderBoard(this.board.grid, () => {});
        
        setTimeout(() => {
            alert(`게임 종료! 당신의 최종 점수: ${this.scoreTimer.score}점`);
            
            // 확인 버튼을 누르면 대기실 화면으로 복귀
            this.ui.switchScreen('screen-room');
            this.ui.updateRoomView(this.roomManager.currentRoomCode, this.roomManager.isHost);
            
            // 모든 플레이어의 isReady 상태가 풀렸으므로, 방장은 다시 대기 상태가 됨
            if (this.roomManager.isHost) {
                this.ui.setupButtons(true);
            }
        }, 100);
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