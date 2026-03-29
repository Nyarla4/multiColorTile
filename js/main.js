import { GameConfig, Board, generateSeed, ScoreTimer } from './game.js';
import { RoomManager, NetworkClient } from './network.js';

// 🚀 [역할 분리] 외부 파일 없이 브라우저 내장 오디오로 효과음 발생
class SoundFX {
    constructor() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
    }

    playPop() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        // 경쾌하게 피치가 올라가는 "뽁!" 소리 파형
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }
}

// [구조] UI 조작 전담
class LobbyUI {
    constructor() {
        // 화면
        this.screenLobby = document.getElementById('screen-lobby');
        this.screenRoom = document.getElementById('screen-room');
        this.screenGame = document.getElementById('screen-game');
        this.screenResult = document.getElementById('screen-result');

        // 로비
        this.inputRoomCode = document.getElementById('input-room-code');

        // 대기실
        this.roomTitle = document.getElementById('room-title');
        this.roomStatus = document.getElementById('room-status');
        this.playerList = document.getElementById('player-list');
        this.btnReady = document.getElementById('btn-ready');
        this.btnStart = document.getElementById('btn-start');
        this.inputNickname = document.getElementById('input-nickname');
        this.nicknameStatus = document.getElementById('nickname-status');

        // 게임
        this.uiTime = document.getElementById('ui-time');
        this.uiScore = document.getElementById('ui-score');
        this.leaderboard = document.getElementById('leaderboard');
        this.gameBoard = document.getElementById('game-board');
        this.toggleEmoji = document.getElementById('toggle-emoji');
        this.toggleEmojiReplay = document.getElementById('toggle-emoji-replay');

        // 결과
        this.resultLeaderboard = document.getElementById('result-leaderboard');
        this.replayTitle = document.getElementById('replay-title');
        this.replayContent = document.getElementById('replay-content');
        this.replayBoard = document.getElementById('replay-board');
        this.replayTime = document.getElementById('replay-time');
        this.replayScore = document.getElementById('replay-score');
        this.btnPlayReplay = document.getElementById('btn-play-replay');
        this.replaySlider = document.getElementById('replay-slider'); // 🚀 [구조 연동] 슬라이더 추가
        this.btnBackToRoom = document.getElementById('btn-back-to-room');

        this.isEmojiMode = false;
        // 🚀 [흐름 제어] 어느 토글을 누르든 상태를 동기화하고 화면을 갱신하는 공통 함수
        const handleToggleChange = (e) => {
            this.isEmojiMode = e.target.checked;

            // 체크박스 시각적 상태 동기화 (게임 화면 스위치 ↔ 리플레이 스위치)
            if (this.toggleEmoji) this.toggleEmoji.checked = this.isEmojiMode;
            if (this.toggleEmojiReplay) this.toggleEmojiReplay.checked = this.isEmojiMode;

            this._refreshAllEmojis(); // 보드 갱신
        };

        // 두 스위치에 동일한 이벤트 연결
        if (this.toggleEmoji) {
            this.toggleEmoji.addEventListener('change', handleToggleChange);
        }
        if (this.toggleEmojiReplay) {
            this.toggleEmojiReplay.addEventListener('change', handleToggleChange);
        }
    }

    // [흐름] 화면 전환
    switchScreen(screenId) {
        [this.screenLobby, this.screenRoom, this.screenGame, this.screenResult]
            .forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    }

    // [흐름] 대기실 헤더 갱신
    updateRoomView(roomCode, isHost) {
        this.roomTitle.innerText = `방 코드: [ ${roomCode} ]`;
        this.roomStatus.innerText = isHost
            ? '당신은 방장입니다. 다른 플레이어를 기다리는 중...'
            : '방에 접속했습니다. 시작을 기다리는 중...';
    }

    // [흐름] 입력값 읽기 / 초기화
    getInputValue() { return this.inputRoomCode.value.trim().toUpperCase(); }
    clearInput() { this.inputRoomCode.value = ''; }

    // [흐름] 접속자 목록 렌더링
    renderPlayers(players, myId) {
        this.playerList.innerHTML = '';
        players.forEach(p => {
            const li = document.createElement('li');
            const name = p.nickname || p.id;
            let text = name;
            if (p.id === myId) text += ' (나)';
            if (p.isHost) text += ' 👑 방장';
            else text += p.isReady ? ' ✅ 준비완료' : ' ⏳ 대기중';
            li.innerText = text;
            this.playerList.appendChild(li);
        });
    }

    // [흐름] 방장/게스트 버튼 표시 분기
    setupButtons(isHost) {
        this.btnReady.style.display = isHost ? 'none' : 'block';
        this.btnStart.style.display = isHost ? 'block' : 'none';
    }

    // [흐름] 닉네임 입력창 초기화 및 피드백
    initNicknameInput(nickname) { this.inputNickname.value = nickname; }
    getNicknameInput() { return this.inputNickname.value.trim(); }

    showNicknameStatus(message, isError = false) {
        this.nicknameStatus.innerText = message;
        this.nicknameStatus.style.color = isError ? 'var(--danger)' : 'var(--accent)';
        setTimeout(() => { this.nicknameStatus.innerText = ''; }, 2000);
    }

    // [흐름] 게임 중 실시간 순위표 렌더링
    renderLeaderboard(players) {
        const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
        this.leaderboard.innerHTML = '<strong>🏆 실시간 순위</strong>';
        sorted.forEach((p, i) => {
            const row = document.createElement('div');
            row.innerText = `${i + 1}. ${p.nickname || p.id} (${p.score || 0})`;
            if (p.isLeaving) row.style.textDecoration = 'line-through';
            this.leaderboard.appendChild(row);
        });
    }

    // [흐름] 타이머·점수 표시 갱신
    updateStats(time, score) {
        this.uiTime.innerText = `Time: ${time}`;
        this.uiScore.innerText = `Score: ${score}`;
    }

    // [흐름] 게임 보드 최초 1회 생성
    initBoard(gridData) {
        this.gameBoard.innerHTML = '';
        gridData.forEach((color, index) => {
            const cell = document.createElement('div');
            cell.dataset.index = index;
            cell.className = 'tile';
            this._applyCell(cell, color);
            this.gameBoard.appendChild(cell);
        });
    }

    // [흐름] 파괴된 셀만 개별 업데이트
    updateCell(index, color) {
        const cell = this.gameBoard.children[index];
        if (!cell) return;

        if (!color) {
            cell.classList.add('tile-pop'); // CSS 폭발 애니메이션 트리거
            setTimeout(() => {
                cell.classList.remove('tile-pop');
                this._applyCell(cell, color);
            }, 150); // 0.15초 뒤에 실제 빈 공간(다크 회색)으로 변경
        } else {
            this._applyCell(cell, color);
        }
    }

    // [흐름] 보드 클릭 이벤트 위임 — 앱 초기화 시 1회만 등록
    bindBoardClick(callback) {
        this.gameBoard.addEventListener('click', (e) => {
            const cell = e.target.closest('[data-index]');
            if (cell) callback(+cell.dataset.index);
        });
    }

    // [흐름] 결과 화면 순위표 렌더링
    renderResultBoard(players, onSelectCallback) {
        const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
        this.resultLeaderboard.innerHTML = '';
        this.replayTitle.innerText = '🔍 복기할 플레이어를 선택하세요';
        this.replayContent.style.display = 'none';

        sorted.forEach((p, i) => {
            const card = document.createElement('div');
            card.className = i === 0 ? 'result-card first-place' : 'result-card';
            card.innerText = `${i + 1}등: ${p.nickname || p.id} (${p.score || 0}점) ${i === 0 ? '👑' : ''}`;
            card.addEventListener('click', () => {
                Array.from(this.resultLeaderboard.children)
                    .forEach(c => c.style.borderColor = 'transparent');
                card.style.borderColor = 'var(--primary)';
                onSelectCallback(p);
            });
            this.resultLeaderboard.appendChild(card);
        });
    }

    // 🚀 [흐름 추가] 슬라이더의 최대치(기록 갯수)를 설정하고 이벤트 연결
    setupReplaySlider(maxSteps, onChangeCallback) {
        if (!this.replaySlider) return;
        this.replaySlider.max = maxSteps;
        this.replaySlider.value = 0;

        // 슬라이더를 마우스로 드래그할 때의 흐름 연결
        this.replaySlider.oninput = (e) => {
            onChangeCallback(parseInt(e.target.value, 10));
        };
    }

    // 🚀 [흐름 추가] 슬라이더 위치만 스크립트에서 변경할 때
    updateReplaySlider(step) {
        if (this.replaySlider) this.replaySlider.value = step;
    }

    // 🚀 [흐름 변경] 뒤로 감기를 위해 미니 보드 전체의 색상과 이모지를 즉시 덮어씌움
    redrawReplayBoard(gridData) {
        if (!this.replayBoard) return;
        Array.from(this.replayBoard.children).forEach((cell, index) => {
            const color = gridData[index];
            cell.dataset.color = color || '';
            cell.style.backgroundColor = color ? color : 'var(--bg-canvas)';
            cell.innerText = (color && this.isEmojiMode) ? GameConfig.emojis[color] : '';
            cell.style.transform = 'scale(1)'; // 애니메이션 흔적 초기화
        });
    }

    // [흐름] 리플레이 미니 보드 초기 세팅
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
            cell.style.backgroundColor = color || 'var(--bg-canvas)';
            cell.innerText = (color && this.isEmojiMode) ? GameConfig.emojis[color] : '';
            this.replayBoard.appendChild(cell);
        });
    }

    // [흐름] 리플레이 미니 보드 개별 셀 업데이트
    updateReplayCell(index, color) {
        const cell = this.replayBoard.children[index];
        if (!cell) return;
        cell.dataset.color = color || '';
        cell.style.backgroundColor = color || 'var(--bg-canvas)';
        cell.innerText = (color && this.isEmojiMode) ? GameConfig.emojis[color] : '';
        if (!color) {
            cell.style.transform = 'scale(0.8)';
            setTimeout(() => { cell.style.transform = 'scale(1)'; }, 100);
        }
    }

    // [흐름] 리플레이 타이머·점수 표시 갱신
    updateReplayStats(time, score) {
        this.replayTime.innerText = `Time: ${time}`;
        this.replayScore.innerText = `Score: ${score}`;
    }

    // [내부] 셀 스타일 공통 적용
    _applyCell(cell, color) {
        cell.dataset.color = color || '';
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

    // [내부] 모양 표시 토글 시 전체 셀 텍스트 갱신
    _refreshAllEmojis() {
        const update = (board) => {
            Array.from(board.children).forEach(cell => {
                const color = cell.dataset.color;
                cell.innerText = (color && this.isEmojiMode) ? GameConfig.emojis[color] : '';
            });
        };
        update(this.gameBoard);
        update(this.replayBoard);
    }
}


// [구조] 중앙 애플리케이션 컨트롤러
class AppController {
    constructor() {
        this.ui = new LobbyUI();
        this.roomManager = new RoomManager();
        this.network = new NetworkClient();

        // 게임 상태
        this.board = null;
        this.scoreTimer = null;
        this.isGameRunning = false;

        // 리플레이 상태
        this.myActionHistory = [];
        this.currentSeed = null;
        this.replayInterval = null;
        this.selectedPlayerData = null;
        this.replayStep = 0; // 🚀 [상태 추가] 현재 리플레이가 몇 번째 행동을 보여주고 있는지 기억

        // 🚀 [구조 연동] 효과음 담당 객체 생성
        this.soundFX = new SoundFX();

        this.bindEvents();
        this.setupNetworkCallbacks();
    }

    // [흐름] 이벤트 바인딩 — 앱 초기화 시 1회 실행
    bindEvents() {
        document.getElementById('btn-create-room').addEventListener('click', () => this.handleCreateRoom());
        document.getElementById('btn-join-room').addEventListener('click', () => this.handleJoinRoom());
        document.getElementById('btn-leave-room').addEventListener('click', () => this.handleLeaveRoom());
        document.getElementById('btn-ready').addEventListener('click', () => this.handleReadyToggle());
        document.getElementById('btn-start').addEventListener('click', () => this.handleGameStart());
        document.getElementById('btn-save-nickname').addEventListener('click', () => this.handleSaveNickname());
        document.getElementById('input-nickname').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.handleSaveNickname(); });

        this.ui.bindBoardClick((index) => this.handleCellClick(index));
        this.ui.btnBackToRoom.addEventListener('click', () => this.handleBackToRoom());
        this.ui.btnPlayReplay.addEventListener('click', () => {
            if (this.replayInterval) {
                this.pauseReplay();
            } else {
                this.startReplaySimulation();
            }
        });
    }

    // [흐름] 네트워크 콜백 설정
    setupNetworkCallbacks() {
        this.network.onSyncState = (playersData) => {
            this.roomManager.syncPlayers(playersData);
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

    // [흐름] 방 생성
    handleCreateRoom() {
        const newCode = this.roomManager.generateRoomCode();
        this.roomManager.setRoomState(newCode, true);
        this.roomManager.addPlayer(this.roomManager.myId, true);

        this.network.connectToRoom(newCode, {
            id: this.roomManager.myId,
            nickname: this.roomManager.myNickname,
            isHost: true,
        });

        this.ui.setupButtons(true);
        this.ui.renderPlayers(this.roomManager.players, this.roomManager.myId);
        this.ui.updateRoomView(this.roomManager.currentRoomCode, true);
        this.ui.initNicknameInput(this.roomManager.myNickname);
        this.ui.switchScreen('screen-room');
    }

    // [흐름] 방 접속
    handleJoinRoom() {
        const code = this.ui.getInputValue();
        if (code.length !== 4) { alert('4자리 방 코드를 정확히 입력해주세요.'); return; }

        this.roomManager.setRoomState(code, false);

        this.network.connectToRoom(code, {
            id: this.roomManager.myId,
            nickname: this.roomManager.myNickname,
            isHost: false,
            isReady: false,
        });

        this.ui.setupButtons(false);
        this.ui.updateRoomView(this.roomManager.currentRoomCode, false);
        this.ui.initNicknameInput(this.roomManager.myNickname);
        this.ui.switchScreen('screen-room');
    }

    // [흐름] 닉네임 저장 및 Presence 즉시 갱신
    handleSaveNickname() {
        const name = this.ui.getNicknameInput();
        if (!name) {
            this.ui.showNicknameStatus('닉네임을 입력해주세요.', true);
            return;
        }
        this.roomManager.setNickname(name);
        this.ui.showNicknameStatus(`"${name}" 으로 저장됐습니다.`);

        const me = this.roomManager.players.find(p => p.id === this.roomManager.myId);
        if (me) {
            this.network.updateMyState({ ...me, nickname: name, updatedAt: Date.now() });
        }
    }

    // [흐름] 준비 토글
    handleReadyToggle() {
        if (this.roomManager.isHost) return;
        const me = this.roomManager.players.find(p => p.id === this.roomManager.myId);
        if (!me) return;

        const desiredReadyState = !me.isReady;
        me.isReady = desiredReadyState;
        this.ui.renderPlayers(this.roomManager.players, this.roomManager.myId);

        this.network.updateMyState({
            id: this.roomManager.myId,
            nickname: this.roomManager.myNickname,
            isHost: false,
            isReady: desiredReadyState,
            updatedAt: Date.now(),
        });
    }

    // [흐름] 게임 시작 (방장 전용)
    handleGameStart() {
        const guests = this.roomManager.players.filter(p => !p.isHost);
        const allReady = guests.length > 0 && guests.every(p => p.isReady);

        if (!allReady && guests.length > 0) {
            alert('모든 참가자가 준비를 완료해야 시작할 수 있습니다.');
            return;
        }

        const seed = generateSeed(GameConfig);
        this.network.broadcastGameStart(seed);
        this.startGameProcess(seed);
    }

    // [흐름] 게임 초기화 및 화면 전환
    startGameProcess(seed) {
        this.isGameRunning = true;
        this.currentSeed = seed;
        this.myActionHistory = [];

        this.board = new Board(GameConfig);
        this.board.initializeWithSeed(seed);
        this.scoreTimer = new ScoreTimer(GameConfig);

        const me = this.roomManager.players.find(p => p.id === this.roomManager.myId);
        if (me) {
            this.network.updateMyState({ ...me, score: 0, isReady: false, updatedAt: Date.now() });
        }

        this.ui.updateStats(this.scoreTimer.time, this.scoreTimer.score);
        this.ui.initBoard(this.board.grid);
        this.ui.switchScreen('screen-game');
        this.scoreTimer.start(() => this.gameLoop());
    }

    // [흐름] 게임 루프 (1초마다 타이머 차감)
    gameLoop() {
        if (!this.isGameRunning) return;
        const timeLeft = this.scoreTimer.tick();
        this.ui.updateStats(timeLeft, this.scoreTimer.score);
        if (this.scoreTimer.isTimeUp()) this.endGame();
    }

    // [흐름] 타일 클릭 처리
    handleCellClick(index) {
        if (!this.board || !this.isGameRunning) return;

        const targetTiles = this.board.getMatchedTilesToDestroy(index);
        if (targetTiles.length === 0) return;

        targetTiles.forEach(idx => {
            this.board.grid[idx] = null;
            this.ui.updateCell(idx, null);
        });

        this.scoreTimer.addScore(targetTiles.length);
        this.ui.updateStats(this.scoreTimer.time, this.scoreTimer.score);

        this.soundFX.playPop();

        this.myActionHistory.push({
            timeLeft: this.scoreTimer.time,
            indexClicked: index,
            currentScore: this.scoreTimer.score,
        });

        const me = this.roomManager.players.find(p => p.id === this.roomManager.myId);
        if (me) {
            this.network.updateMyState({
                ...me,
                score: this.scoreTimer.score,
                history: this.myActionHistory,
                updatedAt: Date.now(),
            });
        }
    }

    // [흐름] 게임 종료 처리
    endGame() {
        this.isGameRunning = false;
        this.scoreTimer.stop();

        this.ui.renderResultBoard(this.roomManager.players, (selectedPlayer) => {
            this.selectedPlayerData = selectedPlayer;
            this.pauseReplay();

            // UI 초기화
            this.ui.setupReplayUI(selectedPlayer, this.currentSeed);

            // 🚀 슬라이더 초기화 및 드래그 콜백 연결
            const historyCount = selectedPlayer.history ? selectedPlayer.history.length : 0;
            this.ui.setupReplaySlider(historyCount, (step) => {
                this.pauseReplay(); // 드래그하면 자동 재생 멈춤
                this.goToReplayStep(step); // 원하는 시점으로 이동!
            });

            this.goToReplayStep(0); // 0단계부터 시작
        });

        this.ui.switchScreen('screen-result');
        this.board = null;
        this.scoreTimer = null;
    }

    // 🚀 [핵심 흐름] 지정된 시점(step)까지 0.001초만에 가상으로 계산해서 화면에 뿌려줌
    goToReplayStep(step) {
        if (!this.selectedPlayerData || !this.currentSeed) return;

        this.replayStep = step;
        this.ui.updateReplaySlider(step);

        // 가상 보드를 꺼내고 초기 시드로 세팅
        const replayBoard = new Board(GameConfig);
        replayBoard.initializeWithSeed(this.currentSeed);

        let currentScore = 0;
        let currentTime = GameConfig.timeLimit;
        const actions = this.selectedPlayerData.history || [];

        // 🚀 0번부터 현재 요청한 step까지 보드를 부수는 과정을 초고속 시뮬레이션!
        for (let i = 0; i < step; i++) {
            const action = actions[i];
            const targetTiles = replayBoard.getMatchedTilesToDestroy(action.indexClicked);
            targetTiles.forEach(idx => replayBoard.grid[idx] = null);
            currentScore = action.currentScore;
            currentTime = action.timeLeft;
        }

        // 연산이 끝난 최종 보드 상태와 점수를 UI에 통째로 넘겨서 그립니다.
        this.ui.redrawReplayBoard(replayBoard.grid);
        this.ui.updateReplayStats(currentTime, currentScore);
    }

    // 🚀 [흐름] 자동 재생 시작
    startReplaySimulation() {
        const actions = this.selectedPlayerData?.history || [];
        if (actions.length === 0) {
            alert("기록된 행동이 없습니다.");
            return;
        }

        // 끝까지 봤는데 다시 재생을 누르면 처음으로 되돌림
        if (this.replayStep >= actions.length) {
            this.goToReplayStep(0);
        }

        this.ui.btnPlayReplay.innerText = "⏸ 일시정지";

        this.replayInterval = setInterval(() => {
            if (this.replayStep >= actions.length) {
                this.pauseReplay();
                this.ui.btnPlayReplay.innerText = "↻ 다시 보기";
                return;
            }
            this.goToReplayStep(this.replayStep + 1);
        }, 200); // 0.2초 간격
    }

    // 🚀 [흐름] 자동 재생 일시정지
    pauseReplay() {
        if (this.replayInterval) {
            clearInterval(this.replayInterval);
            this.replayInterval = null;
        }
        this.ui.btnPlayReplay.innerText = "▶ 재생 시작";
    }

    // [흐름] 결과 화면 → 대기실 복귀
    handleBackToRoom() {
        this.pauseReplay(); // 🚀 나갈 때 일시정지
        if (this.replayInterval) clearInterval(this.replayInterval);

        const me = this.roomManager.players.find(p => p.id === this.roomManager.myId);
        if (me) {
            this.network.updateMyState({
                ...me,
                score: 0,
                history: [],
                isReady: false,
                updatedAt: Date.now(),
            });
        }

        this.ui.switchScreen('screen-room');
        this.ui.updateRoomView(this.roomManager.currentRoomCode, this.roomManager.isHost);
        this.ui.setupButtons(this.roomManager.isHost);
        this.ui.renderPlayers(this.roomManager.players, this.roomManager.myId);
    }

    // [흐름] 방 퇴장
    async handleLeaveRoom() {
        await this.network.disconnect();
        this.roomManager.clearRoomState();
        this.ui.clearInput();
        this.ui.switchScreen('screen-lobby');
    }
}

window.onload = () => { new AppController(); };