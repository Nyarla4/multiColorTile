import { GameConfig, Board, generateSeed, ScoreTimer } from './game.js';
import { RoomManager, NetworkClient } from './network.js';


// [구조] Web Audio API 기반 효과음 전담
class SoundFX {
    constructor() {
        this.ctx = null; // 첫 재생 시점에 지연 생성 — 브라우저 정책 대응
    }

    _getContext() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();
        }
        return this.ctx;
    }

    _play({ type, freqStart, freqEnd, gainStart, duration }) {
        const ctx = this._getContext();
        if (ctx.state === 'suspended') ctx.resume();

        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + duration);
        gain.gain.setValueAtTime(gainStart, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

        osc.start();
        osc.stop(ctx.currentTime + duration);
    }

    playPop()   { this._play({ type: 'sine',     freqStart: 600, freqEnd: 1200, gainStart: 0.3, duration: 0.1 }); }
    playError() { this._play({ type: 'sawtooth', freqStart: 150, freqEnd:  100, gainStart: 0.2, duration: 0.2 }); }
}


// [구조] UI 조작 전담
class LobbyUI {
    constructor() {
        // 화면
        this.screenLobby  = document.getElementById('screen-lobby');
        this.screenRoom   = document.getElementById('screen-room');
        this.screenGame   = document.getElementById('screen-game');
        this.screenResult = document.getElementById('screen-result');

        // 로비
        this.inputRoomCode = document.getElementById('input-room-code');
        this.btnHowTo      = document.getElementById('btn-how-to');      
        this.modalHowTo    = document.getElementById('modal-how-to');    
        this.btnHowToClose = document.getElementById('modal-btn-close-how-to'); 

        // 대기실
        this.roomTitle          = document.getElementById('room-title');
        this.btnCopyLink        = document.getElementById('btn-copy-link');
        this.toggleForceStart   = document.getElementById('toggle-force-start');
        this.roomStatus         = document.getElementById('room-status');
        this.playerList         = document.getElementById('player-list');
        this.playerCountDisplay = document.getElementById('player-count-display');
        this.btnReady           = document.getElementById('btn-ready');
        this.btnStart           = document.getElementById('btn-start');
        this.inputNickname      = document.getElementById('input-nickname');
        this.nicknameStatus     = document.getElementById('nickname-status');
        this.selectTheme        = document.getElementById('select-theme');

        // 게임
        this.uiTime      = document.getElementById('ui-time');
        this.uiScore     = document.getElementById('ui-score');
        this.leaderboard = document.getElementById('leaderboard');
        this.gameBoard   = document.getElementById('game-board');
        this.toggleEmoji = document.getElementById('toggle-emoji');

        // 결과
        this.resultLeaderboard  = document.getElementById('result-leaderboard');
        this.replayTitle        = document.getElementById('replay-title');
        this.replayContent      = document.getElementById('replay-content');
        this.replayBoard        = document.getElementById('replay-board');
        this.replayTime         = document.getElementById('replay-time');
        this.replayScore        = document.getElementById('replay-score');
        this.replaySlider       = document.getElementById('replay-slider');
        this.btnPlayReplay      = document.getElementById('btn-play-replay');
        this.btnBackToRoom      = document.getElementById('btn-back-to-room');
        this.btnLeaveFromResult = document.getElementById('btn-leave-from-result');
        this.toggleEmojiReplay  = document.getElementById('toggle-emoji-replay');

        // 모달
        this.modalRoomNotFound = document.getElementById('modal-room-not-found');
        this.modalChangelog    = document.getElementById('modal-changelog');
        this.btnVersion        = document.getElementById('btn-version');
        this.btnChangelogClose = document.getElementById('modal-btn-close-changelog');

        // 테마 토글 버튼
        this.btnThemeToggle = document.getElementById('btn-theme-toggle');

        this.isEmojiMode = false;
    }
    
    showHowTo() { this.modalHowTo.style.display = 'flex'; }
    hideHowTo() { this.modalHowTo.style.display = 'none'; }

    initTheme() {
        const savedTheme = localStorage.getItem('tileclear_theme') || 'dark';
        this._applyTheme(savedTheme === 'light');
    }

    toggleTheme() {
        const isLight = document.body.classList.toggle('light-mode');
        localStorage.setItem('tileclear_theme', isLight ? 'light' : 'dark');
        this._applyTheme(isLight);
    }

    _applyTheme(isLight) {
        document.body.classList.toggle('light-mode', isLight);
        if (this.btnThemeToggle) this.btnThemeToggle.innerText = isLight ? '☀️' : '🌙';
    }

    initThemeSelector() {
        this.selectTheme.innerHTML = '';
        for (const [key, palette] of Object.entries(GameConfig.palettes)) {
            const option = document.createElement('option');
            option.value     = key;
            option.innerText = palette.name;
            this.selectTheme.appendChild(option);
        }
    }

    bindToggleEvents() {
        const handleToggle = (e) => {
            this.isEmojiMode = e.target.checked;
            if (this.toggleEmoji)       this.toggleEmoji.checked       = this.isEmojiMode;
            if (this.toggleEmojiReplay) this.toggleEmojiReplay.checked = this.isEmojiMode;
            this._refreshBoard(this.gameBoard);
            this._refreshBoard(this.replayBoard);
        };
        this.toggleEmoji     ?.addEventListener('change', handleToggle);
        this.toggleEmojiReplay?.addEventListener('change', handleToggle);
    }

    showRoomNotFoundModal(onCreateCallback, onCancelCallback) {
        this.modalRoomNotFound.style.display = 'flex';

        const btnCreate   = this.modalRoomNotFound.querySelector('#modal-btn-create');
        const btnCancel   = this.modalRoomNotFound.querySelector('#modal-btn-cancel');
        const freshCreate = btnCreate.cloneNode(true);
        const freshCancel = btnCancel.cloneNode(true);
        btnCreate.replaceWith(freshCreate);
        btnCancel.replaceWith(freshCancel);

        freshCreate.addEventListener('click', () => { this.hideRoomNotFoundModal(); onCreateCallback(); });
        freshCancel.addEventListener('click', () => { this.hideRoomNotFoundModal(); onCancelCallback(); });
    }

    hideRoomNotFoundModal() { this.modalRoomNotFound.style.display = 'none'; }
    showChangelog()         { this.modalChangelog.style.display = 'flex'; }
    hideChangelog()         { this.modalChangelog.style.display = 'none'; }

    switchScreen(screenId) {
        [this.screenLobby, this.screenRoom, this.screenGame, this.screenResult]
            .forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    }

    updateRoomView(roomCode, isHost) {
        this.roomTitle.innerText  = roomCode;
    }

    updateRoomStatusText(isHost, isAnyPlaying) {
        if (isHost) {
            this.roomStatus.innerText = '당신은 방장입니다. 다른 플레이어를 기다리는 중...';
        } else if (isAnyPlaying) {
            this.roomStatus.innerText = '현재 게임이 진행 중입니다. 끝날 때까지 대기해주세요 ☕';
        } else {
            this.roomStatus.innerText = '방에 접속했습니다. 시작을 기다리는 중...';
        }
    }

    getInputValue()       { return this.inputRoomCode.value.trim().toUpperCase(); }
    setInputValue(value)  { this.inputRoomCode.value = value; } 
    clearInput()          { this.inputRoomCode.value = ''; }

    updatePlayerCountUI(count) {
        if (this.playerCountDisplay) this.playerCountDisplay.innerText = `현재 ${count}명`;
    }

    renderPlayers(players, myId, isHost, onResetCallback, onKickCallback) {
        this.playerList.innerHTML = '';
        players.forEach(p => {
            const li = document.createElement('li');

            const nameSpan = document.createElement('span');
            const nameText = (p.nickname || p.id) + (p.id === myId ? ' (나)' : '');
            nameSpan.innerText = nameText;
            if (p.id === myId) {
                nameSpan.style.color      = 'var(--highlight)';
                nameSpan.style.fontWeight = 'bold';
            }

            const rightWrap = document.createElement('div');
            rightWrap.style.cssText = 'display:flex; align-items:center; gap:15px;';

            const statusSpan = document.createElement('span');
            statusSpan.style.fontWeight = 'bold';
            if (p.isHost) {
                statusSpan.innerText   = '👑 방장';
                statusSpan.style.color = 'var(--highlight)';
            } else if (p.isPlaying) {
                statusSpan.innerText   = '🎮 플레이중';
                statusSpan.style.color = 'var(--primary)';
            } else {
                statusSpan.innerText   = p.isReady ? '✅ Ready' : '⏳ 대기중';
                statusSpan.style.color = p.isReady ? 'var(--accent)' : 'var(--text-muted)';
            }
            rightWrap.appendChild(statusSpan);

            if (isHost && p.id !== myId) {
                const actionDiv = document.createElement('div');
                actionDiv.className = 'player-actions';

                const resetBtn = document.createElement('button');
                resetBtn.innerText = '🔄 이름';
                resetBtn.className = 'btn-action btn-reset';
                resetBtn.addEventListener('click', () => {
                    if (confirm(`[ ${nameText} ] 님의 닉네임을 초기화하시겠습니까?`)) onResetCallback(p.id);
                });

                const kickBtn = document.createElement('button');
                kickBtn.innerText = '⛔ 추방';
                kickBtn.className = 'btn-action btn-kick';
                kickBtn.addEventListener('click', () => {
                    if (confirm(`[ ${nameText} ] 님을 방에서 추방하시겠습니까?`)) onKickCallback(p.id);
                });

                actionDiv.appendChild(resetBtn);
                actionDiv.appendChild(kickBtn);
                rightWrap.appendChild(actionDiv);
            }

            li.appendChild(nameSpan);
            li.appendChild(rightWrap);
            this.playerList.appendChild(li);
        });
    }

    setupButtons(isHost) {
        this.btnReady.style.display    = isHost ? 'none'  : 'block';
        this.btnStart.style.display    = isHost ? 'block' : 'none';
        this.toggleForceStart.disabled = !isHost;
    }

    updateForceStartUI(isOn) {
        if (this.toggleForceStart.checked !== isOn) {
            this.toggleForceStart.checked = isOn;
        }
    }

    updateReadyButtonUI(isReady) {
        if (isReady) {
            this.btnReady.innerText = '준비 취소';
            this.btnReady.classList.replace('btn-secondary', 'btn-primary');
        } else {
            this.btnReady.innerText = '준비';
            this.btnReady.classList.replace('btn-primary', 'btn-secondary');
        }
    }

    initNicknameInput(nickname) { this.inputNickname.value = nickname; }
    getNicknameInput()          { return this.inputNickname.value.trim(); }

    showNicknameStatus(message, isError = false) {
        this.nicknameStatus.innerText   = message;
        this.nicknameStatus.style.color = isError ? 'var(--danger)' : 'var(--accent)';
        setTimeout(() => { this.nicknameStatus.innerText = ''; }, 2000);
    }

    renderLeaderboard(players, myId) {
        if (!this.leaderboard.querySelector('.leaderboard-header')) {
            this.leaderboard.innerHTML = '<strong class="leaderboard-header" style="display:block; margin-bottom:10px;">🏆 실시간 순위</strong>';
        }

        const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));

        const existingRows = Array.from(this.leaderboard.querySelectorAll('.leaderboard-row'));
        const rowMap = new Map();
        existingRows.forEach(row => rowMap.set(row.dataset.id, row));

        sorted.forEach((p, i) => {
            const isMe = p.id === myId;
            const displayName = isMe ? `${p.nickname || p.id} (나)` : (p.nickname || p.id);
            const rankText = `${i + 1}. ${displayName}`;
            const scoreText = p.score || 0;

            let row = rowMap.get(p.id);

            if (!row) {
                row = document.createElement('div');
                row.className = 'leaderboard-row';
                row.dataset.id = p.id; 

                const nameSpan = document.createElement('span');
                nameSpan.className = 'player-name';
                
                const scoreSpan = document.createElement('span');
                scoreSpan.className = 'player-score';
                
                row.appendChild(nameSpan);
                row.appendChild(scoreSpan);
            } else {
                rowMap.delete(p.id);
            }

            row.querySelector('.player-name').innerText = rankText;
            row.querySelector('.player-score').innerText = scoreText;

            this.leaderboard.appendChild(row);

            if (isMe) { 
                row.style.color = 'var(--highlight)'; 
                row.style.fontWeight = 'bold'; 
            } else {
                row.style.color = ''; 
                row.style.fontWeight = ''; 
            }
            row.style.textDecoration = p.isLeaving ? 'line-through' : 'none';
        });

        rowMap.forEach(row => row.remove());
    }

    updateStats(time, score) {
        this.uiTime.innerText  = `Time: ${time}`;
        this.uiScore.innerText = `Score: ${score}`;
    }

    initBoard(gridData) {
        this.gameBoard.innerHTML = '';
        gridData.forEach((tileIndex, index) => {
            const cell = document.createElement('div');
            cell.dataset.index = index;
            cell.className = 'tile';
            this._applyCell(cell, tileIndex);
            this.gameBoard.appendChild(cell);
        });
    }

    updateCell(index, tileIndex) {
        const cell = this.gameBoard.children[index];
        if (!cell) return;

        if (tileIndex === null) {
            const snapshot = cell.dataset.color;
            cell.classList.add('tile-pop');
            setTimeout(() => {
                cell.classList.remove('tile-pop');
                if (cell.dataset.color === snapshot) this._applyCell(cell, null);
            }, 150);
        } else {
            this._applyCell(cell, tileIndex);
        }
    }

    bindBoardClick(callback) {
        this.gameBoard.addEventListener('pointerdown', (e) => {
            const cell = e.target.closest('[data-index]');
            if (cell) callback(+cell.dataset.index);
        });
    }

    renderResultBoard(players, myId, onSelectCallback) {
        const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
        this.resultLeaderboard.innerHTML = '';
        this.replayTitle.innerText       = '🔍 복기할 플레이어를 선택하세요';
        this.replayContent.style.display = 'none';

        sorted.forEach((p, i) => {
            const card        = document.createElement('div');
            const isMe        = p.id === myId;
            const displayName = isMe ? `${p.nickname || p.id} (나)` : (p.nickname || p.id);

            card.className = 'result-card';
            card.dataset.id = p.id;

            if (i === 0) card.classList.add('first-place');
            if (isMe)    card.classList.add('me-card');

            card.innerText = `${i + 1}등: ${displayName} (${p.score || 0}점) ${i === 0 ? '👑' : ''}`;

            card.addEventListener('click', () => {
                Array.from(this.resultLeaderboard.children)
                    .forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                onSelectCallback(p);
            });
            this.resultLeaderboard.appendChild(card);
        });
    }

    setupReplaySlider(maxSteps, onChangeCallback) {
        this.replaySlider.max     = maxSteps;
        this.replaySlider.value   = 0;
        this.replaySlider.oninput = (e) => onChangeCallback(parseInt(e.target.value, 10));
    }

    updateReplaySlider(step) { this.replaySlider.value = step; }

    setupReplayUI(playerData, initialSeed) {
        this.replayTitle.innerText       = `[ ${playerData.nickname || playerData.id} ] 님의 플레이`;
        this.replayContent.style.display = 'flex';
        this.replayTime.innerText        = 'Time: 120';
        this.replayScore.innerText       = 'Score: 0';

        this.replayBoard.innerHTML = '';
        initialSeed.forEach((tileIndex) => {
            const cell = document.createElement('div');
            cell.className = 'mini-tile';
            this._applyCell(cell, tileIndex);
            this.replayBoard.appendChild(cell);
        });
    }

    redrawReplayBoard(gridData) {
        Array.from(this.replayBoard.children).forEach((cell, index) => {
            this._applyCell(cell, gridData[index]);
            cell.style.transform = 'scale(1)';
        });
    }

    updateReplayStats(time, score) {
        this.replayTime.innerText  = `Time: ${time}`;
        this.replayScore.innerText = `Score: ${score}`;
    }

    _applyCell(cell, tileIndex) {
        cell.dataset.color = tileIndex !== null ? String(tileIndex) : '';

        if (tileIndex !== null) {
            const palette = GameConfig.getActivePalette();
            cell.style.backgroundColor = palette.colors[tileIndex];
            cell.style.cursor          = 'default';
            cell.innerText = this.isEmojiMode ? palette.emojis[tileIndex] : '';
        } else {
            cell.style.backgroundColor = '';
            cell.style.boxShadow       = '';
            cell.style.cursor          = 'pointer';
            cell.innerText             = '';
        }
    }

    _refreshBoard(board) {
        if (!board) return;
        const palette = GameConfig.getActivePalette();
        Array.from(board.children).forEach(cell => {
            const raw = cell.dataset.color;
            if (raw === '' || raw === undefined) return;
            const tileIndex = parseInt(raw, 10);
            cell.innerText = this.isEmojiMode ? palette.emojis[tileIndex] : '';
        });
    }
}


// [구조] 중앙 애플리케이션 컨트롤러
class AppController {
    constructor() {
        this.ui          = new LobbyUI();
        this.roomManager = new RoomManager();
        this.network     = new NetworkClient();
        this.soundFX     = new SoundFX();

        // 게임 상태
        this.board         = null;
        this.scoreTimer    = null;
        this.isGameRunning = false;
        this.currentScreen = 'lobby'; 

        // 🚀 [추가] 결과창 명단 스냅샷 변수 (동결용)
        this.resultParticipants = null;

        // 리플레이 상태
        this.myActionHistory    = [];
        this.currentSeed        = null;
        this.replayInterval     = null;
        this.selectedPlayerData = null;
        this.replayStep         = 0;
        this.lastSyncedScore    = -1; 

        this.replayCache = new Map(); // step → { grid, time, score }

        // 저장된 강제 시작 설정 불러오기 (기본값: false)
        this.isForceStartPersistent = localStorage.getItem('tileclear_force_start') === 'true';

        this.ui.initTheme();
        this.ui.initThemeSelector();
        this.bindEvents();
        this.setupNetworkCallbacks();
        this.checkUrlAndAutoJoin();
    }

    // [흐름] 이벤트 바인딩
    bindEvents() {
        document.getElementById('btn-create-room')  .addEventListener('click',   () => this.handleCreateRoom());
        document.getElementById('btn-join-room')    .addEventListener('click',   () => this.handleJoinRoom());
        document.getElementById('btn-leave-room')   .addEventListener('click',   () => this.handleLeaveRoom());
        document.getElementById('btn-ready')        .addEventListener('click',   () => this.handleReadyToggle());
        document.getElementById('btn-start')        .addEventListener('click',   () => this.handleGameStart());
        document.getElementById('btn-save-nickname').addEventListener('click',   () => this.handleSaveNickname());
        document.getElementById('input-nickname')   .addEventListener('keydown', (e) => { if (e.key === 'Enter') this.handleSaveNickname(); });
        document.getElementById('btn-quick-join')  ?.addEventListener('click',   () => this.handleQuickJoin());

        this.ui.bindBoardClick((index) => this.handleCellClick(index));
        this.ui.bindToggleEvents();
        this.ui.btnBackToRoom      .addEventListener('click', () => this.handleBackToRoom());
        this.ui.btnLeaveFromResult?.addEventListener('click', () => this.handleLeaveRoom());
        this.ui.btnPlayReplay      .addEventListener('click', () => {
            this.replayInterval ? this.pauseReplay() : this.startReplaySimulation();
        });
        this.ui.btnVersion        ?.addEventListener('click', () => this.ui.showChangelog());
        this.ui.btnChangelogClose ?.addEventListener('click', () => this.ui.hideChangelog());
        this.ui.btnCopyLink       ?.addEventListener('click', () => this.handleCopyLink());
        this.ui.btnThemeToggle    ?.addEventListener('click', () => this.ui.toggleTheme());

        this.ui.selectTheme?.addEventListener('change', (e) => {
            GameConfig.activePaletteId = e.target.value;
            if (this.board) this.ui.initBoard(this.board.grid);
            if (this.selectedPlayerData) this.goToReplayStep(this.replayStep);
        });

        this.ui.toggleForceStart?.addEventListener('change', (e) => this.handleForceStartToggle(e.target.checked));

        const handleUnload = () => {
            if (this.roomManager.currentRoomCode) {
                if (this.roomManager.isHost) {
                    this.network.unregisterRoomFromDBOnUnload(this.roomManager.currentRoomCode);
                }
                this.network.disconnect();
            }
        };

        window.addEventListener('beforeunload', handleUnload);
        window.addEventListener('pagehide', handleUnload); 

        this.ui.btnHowTo?.addEventListener('click', () => this.ui.showHowTo());
        this.ui.btnHowToClose?.addEventListener('click', () => this.ui.hideHowTo());
    }

    // [흐름] 빠른 입장
    async handleQuickJoin() {
        const roomCode = await this.network.getRandomRoomFromDB();
        if (!roomCode) {
            alert('현재 대기 중인 방이 없습니다. 직접 방을 만들어보세요!');
            return;
        }
        this.ui.setInputValue(roomCode);
        await this.handleJoinRoom();
    }

    // [흐름] 강제 시작 토글
    handleForceStartToggle(isOn) {
        if (!this.roomManager.isHost) return;
        this.isForceStartPersistent = isOn;
        localStorage.setItem('tileclear_force_start', isOn);

        const me = this.roomManager.players.find(p => p.id === this.roomManager.myId);
        if (me) {
            this.network.updateMyState({ ...me, isForceStartOn: isOn, updatedAt: Date.now() });
        }
    }

    // [흐름] 네트워크 콜백 설정
    setupNetworkCallbacks() {
        this.network.onSyncState = (playersData) => {
            this.roomManager.syncPlayers(playersData);
            if (this.currentScreen === 'result') return; // 🚀 결과창에선 무시!
            this._refreshPlayerView();
        };

        this.network.onGameStart = (seed) => this.startGameProcess(seed);

        this.network.onForceNicknameReset = (targetId) => {
            if (targetId !== this.roomManager.myId) return;
            this.roomManager.setNickname(this.roomManager.myId);
            this.ui.initNicknameInput(this.roomManager.myId);
            const me = this.roomManager.players.find(p => p.id === this.roomManager.myId);
            if (me) this.network.updateMyState({ ...me, nickname: this.roomManager.myId, updatedAt: Date.now() });
        };

        this.network.onPlayerLeft = (leftId) => {
            this.roomManager.markPlayerAsLeft(leftId);
            if (this.currentScreen === 'result') return; // 🚀 결과창 무시!
            this._refreshPlayerView();
        };

        this.network.onPlayerKicked = (targetId) => {
            if (targetId === this.roomManager.myId) {
                alert('방장에 의해 추방되었습니다.');
                this.handleLeaveRoom();
            } else {
                this.roomManager.markPlayerAsLeft(targetId);
                if (this.currentScreen === 'result') return; // 🚀 결과창 무시!
                this._refreshPlayerView();
            }
        };

        // 🚀 뒤늦게 도착한 점수와 리플레이는 원본과 '스냅샷' 양쪽 모두에 저장합니다.
        this.network.onSyncScore = (id, score) => {
            const p = this.roomManager.players.find(p => p.id === id);
            if (p) p.score = score;
            const rp = this.resultParticipants?.find(p => p.id === id);
            if (rp) rp.score = score;
            this._refreshPlayerView();
        };

        this.network.onSyncHistory = (id, score, history) => {
            const p = this.roomManager.players.find(p => p.id === id);
            if (p) { p.score = score; p.history = history; }
            const rp = this.resultParticipants?.find(p => p.id === id);
            if (rp) { rp.score = score; rp.history = history; }
            this._refreshPlayerView();
        };
    }

    // [내부] 게임 중/대기 중 상태에 따라 적절한 뷰 갱신
    _refreshPlayerView() {
        if (this.currentScreen === 'game') {
            const activePlayers = this.roomManager.players.filter(p => p.isPlaying);
            this.ui.renderLeaderboard(activePlayers, this.roomManager.myId);
            
        } else if (this.currentScreen === 'result') {
            // 🚀 전체 명단 대신 '동결된 스냅샷' 사용
            const activePlayers = this.resultParticipants || [];
            const prevSelectedId = this.selectedPlayerData?.id || this.roomManager.myId;

            this.ui.renderResultBoard(activePlayers, this.roomManager.myId, (selectedPlayer) => {
                const isSamePlayer = this.selectedPlayerData?.id === selectedPlayer.id;
                this.selectedPlayerData = selectedPlayer;
                const historyCount = selectedPlayer.history?.length ?? 0;

                if (!isSamePlayer) {
                    this.replayCache = new Map();
                    this.pauseReplay();
                    this.ui.setupReplayUI(selectedPlayer, this.currentSeed);
                    this.ui.setupReplaySlider(historyCount, (step) => {
                        this.pauseReplay();
                        this.goToReplayStep(step);
                    });
                    this.goToReplayStep(historyCount);
                }
                else {
                    // 🚀 패널 증발 방지: 새로고침 되어도 리플레이 패널과 제목을 보이게 복구!
                    this.ui.replayContent.style.display = 'flex';
                    if (this.ui.replayTitle) {
                        this.ui.replayTitle.innerText = `[ ${selectedPlayer.nickname || selectedPlayer.id} ] 님의 플레이`;
                    }
                    // 데이터가 늘어났다면 슬라이더 길이만 연장
                    if (this.ui.replaySlider && parseInt(this.ui.replaySlider.max) !== historyCount) {
                        this.ui.replaySlider.max = historyCount;
                    }
                }
            });

            // 선택 유지 로직
            let playerToSelect = activePlayers.find(p => p.id === prevSelectedId);
            if (!playerToSelect) {
                playerToSelect = activePlayers.find(p => p.id === this.roomManager.myId);
            }
            if (playerToSelect) {
                const card = Array.from(this.ui.resultLeaderboard.children).find(c => c.dataset.id === playerToSelect.id);
                if (card) card.click(); // 강제 클릭 이벤트 발생
            }

        }else {
            this.ui.renderPlayers(
                this.roomManager.players,
                this.roomManager.myId,
                this.roomManager.isHost,
                (targetId) => this.handleForceResetNickname(targetId),
                (targetId) => this.handleKickPlayer(targetId)
            );
            this.ui.updatePlayerCountUI(this.roomManager.players.length);
            const host = this.roomManager.players.find(p => p.isHost);
            if (host) this.ui.updateForceStartUI(!!host.isForceStartOn);

            const isAnyPlaying = this.roomManager.players.some(p => p.isPlaying);
            this.ui.updateRoomStatusText(this.roomManager.isHost, isAnyPlaying);
        }
    }

    // [흐름] 방장이 닉네임 초기화 명령 전파
    handleForceResetNickname(targetId) {
        this.network.broadcastForceNicknameReset(targetId);
    }

    // [흐름] 방장이 추방 명령 실행
    handleKickPlayer(targetId) {
        this.network.broadcastKickPlayer(targetId);
        this.roomManager.markPlayerAsLeft(targetId);
        this._refreshPlayerView();
    }

    // [내부] 방 진입 후 공통 UI 세팅
    _enterRoom(code, isHost) {
        this.currentScreen = 'room'; 
        this.ui.setupButtons(isHost);
        this.ui.updateRoomView(code);
        this.ui.initNicknameInput(this.roomManager.myNickname);
        this._refreshPlayerView();
        this.ui.switchScreen('screen-room');
    }

    // [내부] 방장 자격으로 방 개설 공통 로직
    async _createRoomAsHost(code) {
        await this.network.connectToRoom(code, {
            id:       this.roomManager.myId,
            nickname: this.roomManager.myNickname,
            isHost:   true,
            isForceStartOn: this.isForceStartPersistent
        });
        this.roomManager.setRoomState(code, true);
        this.roomManager.addPlayer(this.roomManager.myId, true);
        await this.network.registerRoomToDB(code); 
        this._enterRoom(code, true);
    }

    // [흐름] URL 쿼리스트링으로 자동 방 접속
    async checkUrlAndAutoJoin() {
        const params   = new URLSearchParams(window.location.search);
        const roomCode = params.get('room');
        if (roomCode && roomCode.length === 4) {
            this.ui.setInputValue(roomCode.toUpperCase());
            await this.handleJoinRoom();
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    // [흐름] 초대 링크 복사
    handleCopyLink() {
        const code = this.roomManager.currentRoomCode;
        if (!code) return;
        const link = `${window.location.origin}${window.location.pathname}?room=${code}`;
        navigator.clipboard.writeText(link)
            .then(()  => alert('🔗 초대 링크가 복사되었습니다!\n친구에게 공유해보세요.'))
            .catch(()  => alert('복사에 실패했습니다. 브라우저 권한을 확인해주세요.'));
    }

    // [흐름] 방 생성
    async handleCreateRoom() {
        const btn = document.getElementById('btn-create-room');
        btn.innerText = '방 생성 중... ⏳';
        btn.disabled = true;

        const newCode = this.roomManager.generateRoomCode();
        try {
            await this._createRoomAsHost(newCode);
        } catch (error) {
            alert(`방 생성에 실패했습니다. (원인: ${error.message})\n잠시 후 다시 시도해주세요.`);
        } finally {
            btn.innerText = '방 생성';
            btn.disabled = false;
        }
    }

    // [흐름] 방 접속
    async handleJoinRoom() {
        const code = this.ui.getInputValue();
        if (code.length !== 4) { alert('4자리 방 코드를 정확히 입력해주세요.'); return; }
        
        const btn = document.getElementById('btn-join-room');
        btn.innerText = '접속 중... ⏳';
        btn.disabled = true;

        try {
            await this.network.connectToRoom(code, {
                id:       this.roomManager.myId,
                nickname: this.roomManager.myNickname,
                isHost:   false,
                isReady:  false,
            });
            this.roomManager.setRoomState(code, false);
            this._enterRoom(code, false);

        } catch (error) {
            this.roomManager.clearRoomState();

            if (error.message === 'ROOM_NOT_FOUND') {
                this.network.unregisterRoomFromDB(code);
                this.ui.showRoomNotFoundModal(
                    async () => {
                        try {
                            await this._createRoomAsHost(code); 
                        } catch {
                            alert('방 생성에 실패했습니다. 다시 시도해주세요.');
                        }
                    },
                    () => {} 
                );
            } else {
                alert('방 접속에 실패했습니다. 다시 시도해주세요.');
            }
        } finally {
            btn.innerText = '방 접속';
            btn.disabled = false;
        }
    }

    // [흐름] 닉네임 저장 및 Presence 즉시 갱신
    handleSaveNickname() {
        const name = this.ui.getNicknameInput();
        if (!name) { this.ui.showNicknameStatus('닉네임을 입력해주세요.', true); return; }

        this.roomManager.setNickname(name);
        this.ui.showNicknameStatus(`"${name}" 으로 저장됐습니다.`);

        const me = this.roomManager.players.find(p => p.id === this.roomManager.myId);
        if (me) this.network.updateMyState({ ...me, nickname: name, updatedAt: Date.now() });
    }

    // [흐름] 준비 토글
    handleReadyToggle() {
        if (this.roomManager.isHost) return;
        const me = this.roomManager.players.find(p => p.id === this.roomManager.myId);
        if (!me) return;

        const desiredReadyState = !me.isReady;
        me.isReady = desiredReadyState;
        this._refreshPlayerView();
        this.ui.updateReadyButtonUI(desiredReadyState);

        this.network.updateMyState({
            id:        this.roomManager.myId,
            nickname:  this.roomManager.myNickname,
            isHost:    false,
            isReady:   desiredReadyState,
            updatedAt: Date.now(),
        });
    }

    // [흐름] 게임 시작 (방장 전용)
    handleGameStart() {
        const host         = this.roomManager.players.find(p => p.isHost);
        const isForceStart = host?.isForceStartOn ?? false;
        const guests       = this.roomManager.players.filter(p => !p.isHost);

        if (guests.length === 0) { this._doStartGame(); return; }

        if (!isForceStart && !guests.every(p => p.isReady)) {
            alert('모든 참가자가 준비를 완료해야 시작할 수 있습니다.\n또는 [강제 시작] 설정을 켜주세요.');
            return;
        }

        this._doStartGame();
    }

    // [내부] 실제 게임 시작 신호 전파 및 로컬 실행
    _doStartGame() {
        if (this.roomManager.isHost) {
            this.network.unregisterRoomFromDB(this.roomManager.currentRoomCode);
        }

        const seed = generateSeed(GameConfig);
        this.network.broadcastGameStart(seed);
        this.startGameProcess(seed);
    }

    // [흐름] 게임 초기화 및 화면 전환
    startGameProcess(seed) {
        this.currentScreen = 'game'; 
        this.isGameRunning   = true;
        this.currentSeed     = seed;
        this.myActionHistory = [];
        this.lastSyncedScore = 0; 

        this.board      = new Board(GameConfig);
        this.board.initializeWithSeed(seed);
        this.scoreTimer = new ScoreTimer(GameConfig);

        const me = this.roomManager.players.find(p => p.id === this.roomManager.myId);
        if (me) this.network.updateMyState({ ...me, score: 0, isReady: false, isPlaying: true, updatedAt: Date.now() });

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

        if (this.lastSyncedScore !== this.scoreTimer.score) {
            this.lastSyncedScore = this.scoreTimer.score;
            this.network.broadcastScore(this.roomManager.myId, this.scoreTimer.score);
        }

        if (this.scoreTimer.isTimeUp()) this.endGame();
    }

    // [흐름] 타일 클릭 처리
    handleCellClick(index) {
        if (!this.board || !this.isGameRunning) return;

        const targetTiles = this.board.getMatchedTilesToDestroy(index);

        if (targetTiles.length === 0) {
            if (this.scoreTimer.score > 0) this.scoreTimer.addScore(-1);
            this.soundFX.playError();
        } else {
            targetTiles.forEach(idx => {
                this.board.grid[idx] = null;
                this.ui.updateCell(idx, null);
            });
            this.scoreTimer.addScore(targetTiles.length);
            this.soundFX.playPop();
        }

        this.ui.updateStats(this.scoreTimer.time, this.scoreTimer.score);
        this.myActionHistory.push([this.scoreTimer.time, index, this.scoreTimer.score]);

        const me = this.roomManager.players.find(p => p.id === this.roomManager.myId);
        if (me) {
            me.score = this.scoreTimer.score;
            this._refreshPlayerView(); 
        }
    }

    // [흐름] 게임 종료 처리
    endGame() {
        const finalScore = this.scoreTimer?.score ?? 0;
        this.isGameRunning = false;
        this.currentScreen = 'result'; // 🚀 [추가] 상태 변경
        this.scoreTimer?.stop();
        this.board      = null;
        this.scoreTimer = null;

        const me = this.roomManager.players.find(p => p.id === this.roomManager.myId);
        if (me) {
            me.score = finalScore;
            me.history = this.myActionHistory; 
        }

        // 🚀 1. 스냅샷 생성: 게임 종료 시점의 플레이어 목록 고정!
        this.resultParticipants = this.roomManager.players
            .filter(p => p.isPlaying)
            .map(p => ({ ...p }));

        // 🚀 2. 상태망(Presence) 통신: history는 제외하고 결과창 유지를 위해 isPlaying은 true로!
        this.network.updateMyState({
            id:        this.roomManager.myId,
            nickname:  this.roomManager.myNickname,
            isHost:    this.roomManager.isHost,
            isReady:   false,
            isPlaying: true, // 🚨 결과창에 남으려면 반드시 true!
            score:     finalScore,
            updatedAt: Date.now(),
        });

        // 🚀 3. 무전기(Broadcast) 통신: 거대한 리플레이 데이터는 따로 전송
        this.network.broadcastHistory(this.roomManager.myId, finalScore, this.myActionHistory);

        this.ui.switchScreen('screen-result');
        this._refreshPlayerView();
    }

    // [흐름] 지정 시점(step)의 보드 상태를 계산 후 즉시 렌더링
    goToReplayStep(step) {
        if (!this.selectedPlayerData || !this.currentSeed) return;

        this.replayStep = step;
        this.ui.updateReplaySlider(step);

        // 캐시 히트
        if (this.replayCache.has(step)) {
            const { grid, time, score } = this.replayCache.get(step);
            this.ui.redrawReplayBoard(grid);
            this.ui.updateReplayStats(time, score);
            return;
        }

        // 가장 가까운 캐시 지점부터 계산
        let startStep = 0;
        let replayBoard = null;
        for (let s = step - 1; s >= 0; s--) {
            if (this.replayCache.has(s)) {
                startStep = s;
                const cached = this.replayCache.get(s);
                replayBoard = new Board(GameConfig);
                replayBoard.grid = [...cached.grid];
                break;
            }
        }
        if (!replayBoard) {
            replayBoard = new Board(GameConfig);
            replayBoard.initializeWithSeed(this.currentSeed);
        }

        const actions = this.selectedPlayerData.history || [];
        let currentScore = 0, currentTime = GameConfig.timeLimit;

        for (let i = startStep; i < step; i++) {
            const action = actions[i];
            const [time, idx, score] = Array.isArray(action)
                ? [action[0], action[1], action[2]]
                : [action.timeLeft, action.indexClicked, action.currentScore];
            replayBoard.getMatchedTilesToDestroy(idx)
                .forEach(id => { replayBoard.grid[id] = null; });
            currentScore = score;
            currentTime = time;
        }

        this.replayCache.set(step, {
            grid: [...replayBoard.grid],
            time: currentTime,
            score: currentScore,
        });

        this.ui.redrawReplayBoard(replayBoard.grid);
        this.ui.updateReplayStats(currentTime, currentScore);
    }

    // [흐름] 자동 재생 시작
    startReplaySimulation() {
        const actions = this.selectedPlayerData?.history || [];
        if (actions.length === 0) { alert('기록된 행동이 없습니다.'); return; }

        if (this.replayStep >= actions.length) this.goToReplayStep(0);

        this.ui.btnPlayReplay.innerText = '⏸ 일시정지';

        this.replayInterval = setInterval(() => {
            if (this.replayStep >= actions.length) {
                this.pauseReplay();
                this.ui.btnPlayReplay.innerText = '↻ 다시 보기';
                return;
            }
            this.goToReplayStep(this.replayStep + 1);
        }, 200);
    }

    // [흐름] 자동 재생 일시정지
    pauseReplay() {
        if (this.replayInterval) {
            clearInterval(this.replayInterval);
            this.replayInterval = null;
        }
        this.ui.btnPlayReplay.innerText = '▶ 재생 시작';
    }

    // [흐름] 결과 화면 → 대기실 복귀
    handleBackToRoom() {
        this.currentScreen = 'room';
        this.pauseReplay();

        this.roomManager.cleanLeftPlayers();

        this.network.updateMyState({
            id:        this.roomManager.myId,
            nickname:  this.roomManager.myNickname,
            isHost:    this.roomManager.isHost,
            isReady:   false,
            isLeaving: false,
            isPlaying: false,
            isForceStartOn: this.isForceStartPersistent,
            score:     0,
            history:   [],
            updatedAt: Date.now(),
        });

        this.ui.switchScreen('screen-room');
        this.ui.updateRoomView(this.roomManager.currentRoomCode);
        this.ui.setupButtons(this.roomManager.isHost);
        this.ui.updateReadyButtonUI(false);
        this._refreshPlayerView();
    }

    // [흐름] 방 퇴장 — 화면 전환 우선, 통신은 백그라운드 처리
    async handleLeaveRoom() {
        if (this.roomManager.isHost && this.roomManager.currentRoomCode) {
            this.network.unregisterRoomFromDB(this.roomManager.currentRoomCode);
        }

        this.ui.clearInput();
        this.ui.switchScreen('screen-lobby');
        await this.network.disconnect();
        this.roomManager.clearRoomState();
    }
}

window.onload = () => { new AppController(); };