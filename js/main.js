import { GameConfig, Board, generateSeed, ScoreTimer } from './game.js';
import { RoomManager, NetworkClient } from './network.js';
// 향후 game.js의 Board, GameConfig 등을 가져와 게임 시작 흐름을 추가합니다.

// [구조] UI 조작 전담
class LobbyUI {
    constructor() {
        this.screenLobby = document.getElementById('screen-lobby');
        this.screenRoom = document.getElementById('screen-room');
        this.screenGame = document.getElementById('screen-game');
        this.screenResult = document.getElementById('screen-result');// 🚀 결과 화면 연동

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

        // 🚀 결과 화면 UI 요소 연동
        this.resultLeaderboard = document.getElementById('result-leaderboard');
        this.replayTitle = document.getElementById('replay-title');
        this.replayContent = document.getElementById('replay-content');
        this.replayBoard = document.getElementById('replay-board');
        this.replayTime = document.getElementById('replay-time');
        this.replayScore = document.getElementById('replay-score');
        this.btnPlayReplay = document.getElementById('btn-play-replay');
        this.btnBackToRoom = document.getElementById('btn-back-to-room');

        // 닉네임 UI (screen-room 안에 있음)
        this.inputNickname = document.getElementById('input-nickname');
        this.nicknameStatus = document.getElementById('nickname-status');

        // 🚀 [구조 연동] 토글 스위치 및 이모지 모드 상태
        this.toggleEmoji = document.getElementById('toggle-emoji');
        this.isEmojiMode = false; 

        // 🚀 [흐름 추가] 토글을 누를 때마다 즉시 화면을 갱신
        if(this.toggleEmoji) {
            this.toggleEmoji.addEventListener('change', (e) => {
                this.isEmojiMode = e.target.checked;
                this.refreshAllEmojis();
            });
        }
    }

    switchScreen(screenId) {
        this.screenLobby.classList.remove('active');
        this.screenRoom.classList.remove('active');
        this.screenGame.classList.remove('active');
        this.screenResult.classList.remove('active'); // 🚀 결과 화면 끄기 추가
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

            const displayName = p.nickname || p.id;
            let text = displayName;
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

    // 🚀 [핵심 흐름] 토글을 누르는 즉시 게임 보드와 리플레이 보드의 모든 텍스트를 갱신
    refreshAllEmojis() {
        if (this.gameBoard) {
            Array.from(this.gameBoard.children).forEach(cell => {
                const color = cell.dataset.color;
                cell.innerText = (color && this.isEmojiMode) ? GameConfig.emojis[color] : '';
            });
        }
        if (this.replayBoard) {
            Array.from(this.replayBoard.children).forEach(cell => {
                const color = cell.dataset.color;
                cell.innerText = (color && this.isEmojiMode) ? GameConfig.emojis[color] : '';
            });
        }
    }

    updateStats(time, score) {
        this.uiTime.innerText = `Time: ${time}`;
        this.uiScore.innerText = `Score: ${score}`;
    }

    // 🚀 [흐름] 점수 기반으로 내림차순 정렬하여 순위표 렌더링
    renderLeaderboard(players) {
        const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
        this.leaderboard.innerHTML = '';
        sorted.forEach((p, index) => {
            const row = document.createElement('div');
            const displayName = p.nickname || p.id;
            row.innerText = `${index === 0 ? '🥇' : index+1+'.'} ${displayName} (${p.score || 0})`;
            row.style.whiteSpace = 'nowrap';
            if (p.isLeaving) row.style.textDecoration = 'line-through';
            this.leaderboard.appendChild(row);
        });
    }

    // 게임 시작 시 딱 1회만 호출 — 345개 셀 생성
    initBoard(gridData) {
        this.gameBoard.innerHTML = '';
        gridData.forEach((color, index) => {
            const cell = document.createElement('div');
            cell.dataset.index = index;
            cell.className = 'tile'; // 🚀 CSS 클래스로 크기 제어
            this._applyCell(cell, color);
            this.gameBoard.appendChild(cell);
        });
    }

    // 타일 파괴 시 해당 셀 하나만 업데이트
    updateCell(index, color) {
        const cell = this.gameBoard.children[index];
        if (cell) this._applyCell(cell, color);
    }

    // 셀 스타일 적용 (공통 로직)
    _applyCell(cell, color) {
        cell.dataset.color = color || ''; // 나중에 갱신을 위해 색상 기록
        if (color) {
            cell.style.backgroundColor = color;
            cell.style.boxShadow = 'inset 0 0 8px rgba(0,0,0,0.4)';
            cell.style.cursor = 'default';
            cell.innerText = this.isEmojiMode ? GameConfig.emojis[color] : '';
        } else {
            cell.style.backgroundColor = 'var(--bg-canvas)';
            cell.style.boxShadow = '';
            cell.style.cursor = 'pointer';
            cell.innerText = '';
        }
    }

    bindBoardClick(callback) {
        this.gameBoard.addEventListener('click', (e) => {
            const cell = e.target.closest('[data-index]');
            if (cell) callback(+cell.dataset.index);
        });
    }

    // 🚀 [구조] 결과 화면의 순위표 렌더링 및 클릭 이벤트
    renderResultBoard(players, onPlayerSelectCallback) {
        const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
        this.resultLeaderboard.innerHTML = '';
        this.replayTitle.innerText = "🔍 복기할 플레이어를 선택하세요";
        this.replayContent.style.display = 'none';

        sorted.forEach((p, index) => {
            const card = document.createElement('div');
            card.className = index === 0 ? 'result-card first-place' : 'result-card'; // 🚀 CSS 클래스 활용
            
            const displayName = p.nickname || p.id;
            card.innerText = `${index + 1}등: ${displayName} (${p.score || 0}점) ${index === 0 ? '👑' : ''}`;

            card.addEventListener('click', () => {
                Array.from(this.resultLeaderboard.children).forEach(c => c.style.borderColor = 'transparent');
                card.style.borderColor = 'var(--primary)';
                onPlayerSelectCallback(p);
            });

            this.resultLeaderboard.appendChild(card);
        });
    }

    // 🚀 [구조] 미니 보드(리플레이 용) 초기 렌더링
    setupReplayUI(playerData, initialSeed) {
        this.replayTitle.innerText = `[ ${playerData.nickname || playerData.id} ] 님의 플레이`;
        this.replayContent.style.display = 'flex';
        this.replayTime.innerText = 'Time: 120';
        this.replayScore.innerText = 'Score: 0';

        this.replayBoard.innerHTML = '';
        initialSeed.forEach((color) => {
            const cell = document.createElement('div');
            cell.className = 'mini-tile';
            cell.dataset.color = color || '';
            cell.style.backgroundColor = color ? color : 'var(--bg-canvas)';
            cell.innerText = (color && this.isEmojiMode) ? GameConfig.emojis[color] : '';
            this.replayBoard.appendChild(cell);
        });
    }

    // 🚀 [흐름] 미니 보드의 타일 파괴 연출
    updateReplayCell(index, color) {
        const cell = this.replayBoard.children[index];
        if (cell) {
            cell.dataset.color = color || '';
            cell.style.backgroundColor = color ? color : 'var(--bg-canvas)';
            cell.innerText = (color && this.isEmojiMode) ? GameConfig.emojis[color] : '';
            if (!color) {
                cell.style.transform = 'scale(0.8)';
                setTimeout(() => cell.style.transform = 'scale(1)', 100);
            }
        }
    }

    updateReplayStats(time, score) {
        this.replayTime.innerText = `Time: ${time}`;
        this.replayScore.innerText = `Score: ${score}`;
    }

    initNicknameInput(currentNickname) {
        this.inputNickname.value = currentNickname;
    }

    getNicknameInput() {
        return this.inputNickname.value.trim();
    }

    showNicknameStatus(message, isError = false) {
        this.nicknameStatus.innerText = message;
        this.nicknameStatus.style.color = isError ? '#dc3545' : '#28a745';
        setTimeout(() => { this.nicknameStatus.innerText = ''; }, 2000);
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

        // 🚀 [구조 추가] 행동 기록 및 리플레이 상태
        this.myActionHistory = []; 
        this.currentSeed = null; 
        this.replayInterval = null; 
        this.selectedPlayerData = null;

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

        this.ui.bindBoardClick((index) => this.handleCellClick(index));

        // 🚀 [흐름 연동] 결과 화면 버튼 이벤트
        this.ui.btnBackToRoom.addEventListener('click', () => this.handleBackToRoom());
        this.ui.btnPlayReplay.addEventListener('click', () => {
            if (this.selectedPlayerData) this.startReplaySimulation(this.selectedPlayerData);
        });

        document.getElementById('btn-save-nickname').addEventListener('click', () => this.handleSaveNickname());
        document.getElementById('input-nickname').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.handleSaveNickname();
        });
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
        this.network.connectToRoom(newCode, {
            id: this.roomManager.myId,
            nickname: this.roomManager.myNickname,
            isHost: true
        });

        this.ui.setupButtons(true);
        this.ui.renderPlayers(this.roomManager.players, this.roomManager.myId);
        this.ui.updateRoomView(this.roomManager.currentRoomCode, true);
        this.ui.initNicknameInput(this.roomManager.myNickname); // ← 방 진입 시 초기화
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
            nickname: this.roomManager.myNickname,
            isHost: false,
            isReady: false
        });

        this.ui.setupButtons(false);
        this.ui.updateRoomView(this.roomManager.currentRoomCode, false);
        this.ui.initNicknameInput(this.roomManager.myNickname); // ← 방 진입 시 초기화
        this.ui.switchScreen('screen-room');
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
            nickname: this.roomManager.myNickname, // ← 추가
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

    handleSaveNickname() {
        const name = this.ui.getNicknameInput();
        if (!name) {
            this.ui.showNicknameStatus('닉네임을 입력해주세요.', true);
            return;
        }

        this.roomManager.setNickname(name);
        this.ui.showNicknameStatus(`"${name}" 으로 저장됐습니다.`);

        // Presence 즉시 갱신 — 다른 플레이어 화면에 바로 반영
        const me = this.roomManager.players.find(p => p.id === this.roomManager.myId);
        if (me) {
            this.network.updateMyState({ ...me, nickname: name, updatedAt: Date.now() });
        }
    }

    // 🚀 [흐름 추가] 실제 게임 화면 전환 및 렌더링 프로세스
    startGameProcess(seed) {
        this.isGameRunning = true;
        this.currentSeed = seed; // 🚀 초기 시드 저장
        this.myActionHistory = []; // 🚀 내 행동 기록 초기화

        this.board = new Board(GameConfig);
        this.board.initializeWithSeed(seed);
        this.scoreTimer = new ScoreTimer(GameConfig);

        // 내 초기 점수를 0점으로 세팅하고, 준비(isReady) 상태를 강제로 해제합니다. (다음 게임을 위해)
        const me = this.roomManager.players.find(p => p.id === this.roomManager.myId);
        if (me) {
            this.network.updateMyState({ ...me, score: 0, isReady: false, updatedAt: Date.now() });
        }

        this.ui.updateStats(this.scoreTimer.time, this.scoreTimer.score);
        this.ui.initBoard(this.board.grid);                              // ← 변경
        this.ui.switchScreen('screen-game');
        this.scoreTimer.start(() => this.gameLoop());
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

    handleCellClick(index) {
        if (!this.board || !this.isGameRunning) return;

        const targetTiles = this.board.getMatchedTilesToDestroy(index);

        if (targetTiles.length > 0) {
            targetTiles.forEach(idx => {
                this.board.grid[idx] = null;
                this.ui.updateCell(idx, null);
            });

            this.scoreTimer.addScore(targetTiles.length);
            this.ui.updateStats(this.scoreTimer.time, this.scoreTimer.score);

            this.myActionHistory.push({
                timeLeft: this.scoreTimer.time,
                indexClicked: index,
                currentScore: this.scoreTimer.score
            });

            const me = this.roomManager.players.find(p => p.id === this.roomManager.myId);
            if (me) {
                // ← history를 함께 실어서 전송
                this.network.updateMyState({
                    ...me,
                    score: this.scoreTimer.score,
                    history: this.myActionHistory,
                    updatedAt: Date.now()
                });
            }
        }
    }

    // 🚀 [흐름] 게임 종료 처리
    endGame() {
        this.isGameRunning = false; // isGameRunning = false면 handleCellClick 상단에서 자동 차단됨
        this.scoreTimer.stop();
        // ← renderBoard(this.board.grid, () => {}) 제거 — isGameRunning 체크로 충분

        // 결과 화면 UI 업데이트 및 전환 (콜백으로 플레이어 선택 시 복기 준비)
        this.ui.renderResultBoard(this.roomManager.players, (selectedPlayer) => {
            this.selectedPlayerData = selectedPlayer;
            
            // 기존 재생 중이던 루프가 있다면 강제 종료
            if (this.replayInterval) clearInterval(this.replayInterval);
            
            this.ui.setupReplayUI(selectedPlayer, this.currentSeed);
            this.ui.btnPlayReplay.disabled = false;
            this.ui.btnPlayReplay.innerText = "▶ 고속 재생 시작";
        });
        
        this.ui.switchScreen('screen-result');
        this.board = null;
        this.scoreTimer = null;
    }

    // 🚀 [핵심 흐름] 과거의 클릭 기록을 가상 보드에 넣고 돌리는 시뮬레이터
    startReplaySimulation(playerData) {
        if (!this.currentSeed || !playerData.history || playerData.history.length === 0) {
            alert("기록된 행동이 없습니다.");
            return;
        }

        this.ui.btnPlayReplay.disabled = true;
        this.ui.btnPlayReplay.innerText = "재생 중...";
        this.ui.setupReplayUI(playerData, this.currentSeed); // 보드를 120초 상태로 다시 세팅

        // 가상 보드 객체 생성
        const replayBoard = new Board(GameConfig);
        replayBoard.initializeWithSeed(this.currentSeed);

        const actions = [...playerData.history]; 
        let actionIndex = 0;

        // 0.2초마다 다음 클릭 액션을 실행하는 고속 루프
        this.replayInterval = setInterval(() => {
            if (actionIndex >= actions.length) {
                clearInterval(this.replayInterval);
                this.ui.btnPlayReplay.disabled = false;
                this.ui.btnPlayReplay.innerText = "↻ 다시 보기";
                return;
            }

            const action = actions[actionIndex];
            const targetTiles = replayBoard.getMatchedTilesToDestroy(action.indexClicked);
            
            if (targetTiles.length > 0) {
                targetTiles.forEach(idx => {
                    replayBoard.grid[idx] = null; 
                    this.ui.updateReplayCell(idx, null); 
                });
            }

            this.ui.updateReplayStats(action.timeLeft, action.currentScore);
            actionIndex++;
        }, 200); // 0.2초 배속 재생
    }

    handleBackToRoom() {
        if (this.replayInterval) clearInterval(this.replayInterval);

        const me = this.roomManager.players.find(p => p.id === this.roomManager.myId);
        if (me) {
            this.network.updateMyState({ ...me, score: 0, history: [], isReady: false, updatedAt: Date.now() });
        }

        this.ui.switchScreen('screen-room');
        this.ui.updateRoomView(this.roomManager.currentRoomCode, this.roomManager.isHost);
        this.ui.setupButtons(this.roomManager.isHost);                              // ← 방장/게스트 모두 처리
        this.ui.renderPlayers(this.roomManager.players, this.roomManager.myId);     // ← 명시적 갱신 추가
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