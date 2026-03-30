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

        // 대기실
        this.roomTitle        = document.getElementById('room-title');
        this.btnCopyLink      = document.getElementById('btn-copy-link');
        this.toggleForceStart = document.getElementById('toggle-force-start');
        this.roomStatus       = document.getElementById('room-status');
        this.playerList       = document.getElementById('player-list');
        this.btnReady         = document.getElementById('btn-ready');
        this.btnStart         = document.getElementById('btn-start');
        this.inputNickname    = document.getElementById('input-nickname');
        this.nicknameStatus   = document.getElementById('nickname-status');
        this.selectTheme      = document.getElementById('select-theme');

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

    // [흐름] 다크/라이트 테마 초기화 — localStorage 저장값 복원
    initTheme() {
        const savedTheme = localStorage.getItem('tileclear_theme') || 'dark';
        this._applyTheme(savedTheme === 'light');
    }

    // [흐름] 다크/라이트 테마 전환
    toggleTheme() {
        const isLight = document.body.classList.toggle('light-mode');
        localStorage.setItem('tileclear_theme', isLight ? 'light' : 'dark');
        this._applyTheme(isLight);
    }

    // [내부] 테마 적용 (아이콘 갱신 포함)
    _applyTheme(isLight) {
        document.body.classList.toggle('light-mode', isLight);
        if (this.btnThemeToggle) this.btnThemeToggle.innerText = isLight ? '☀️' : '🌙';
    }

    // [흐름] 테마 목록을 드롭다운에 초기 생성
    initThemeSelector() {
        this.selectTheme.innerHTML = '';
        for (const [key, palette] of Object.entries(GameConfig.palettes)) {
            const option = document.createElement('option');
            option.value     = key;
            option.innerText = palette.name;
            this.selectTheme.appendChild(option);
        }
    }

    // [흐름] 이모지 토글 이벤트 바인딩 — AppController.bindEvents()에서 호출
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

    // [흐름] 방 없음 모달 표시 — 버튼을 clone으로 교체해 이벤트 중복 방지
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

    // [흐름] 화면 전환
    switchScreen(screenId) {
        [this.screenLobby, this.screenRoom, this.screenGame, this.screenResult]
            .forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    }

    // [흐름] 대기실 헤더 갱신
    updateRoomView(roomCode, isHost) {
        this.roomTitle.innerText  = roomCode;
        this.roomStatus.innerText = isHost
            ? '당신은 방장입니다. 다른 플레이어를 기다리는 중...'
            : '방에 접속했습니다. 시작을 기다리는 중...';
    }

    // [흐름] 로비 입력값
    getInputValue() { return this.inputRoomCode.value.trim().toUpperCase(); }
    clearInput()    { this.inputRoomCode.value = ''; }

    // [흐름] 접속자 목록 렌더링
    renderPlayers(players, myId, isHost, onResetCallback, onKickCallback) {
        this.playerList.innerHTML = '';
        players.forEach(p => {
            const li = document.createElement('li');

            // 왼쪽: 닉네임
            const nameSpan = document.createElement('span');
            const nameText = (p.nickname || p.id) + (p.id === myId ? ' (나)' : '');
            nameSpan.innerText = nameText;
            if (p.id === myId) {
                nameSpan.style.color      = 'var(--highlight)';
                nameSpan.style.fontWeight = 'bold';
            }

            // 오른쪽: 상태 + 관리 버튼 묶음
            const rightWrap = document.createElement('div');
            rightWrap.style.cssText = 'display:flex; align-items:center; gap:15px;';

            const statusSpan = document.createElement('span');
            statusSpan.style.fontWeight = 'bold';
            if (p.isHost) {
                statusSpan.innerText   = '👑 방장';
                statusSpan.style.color = 'var(--highlight)';
            } else {
                statusSpan.innerText   = p.isReady ? '✅ Ready' : '⏳ 대기중';
                statusSpan.style.color = p.isReady ? 'var(--accent)' : 'var(--text-muted)';
            }
            rightWrap.appendChild(statusSpan);

            // 방장에게만, 본인 제외 관리 버튼 노출
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

    // [흐름] 방장/게스트 버튼 분기 및 강제시작 토글 활성화 여부
    setupButtons(isHost) {
        this.btnReady.style.display    = isHost ? 'none'  : 'block';
        this.btnStart.style.display    = isHost ? 'block' : 'none';
        this.toggleForceStart.disabled = !isHost;
    }

    // [흐름] 강제 시작 토글 UI 동기화 (방장의 Presence 상태를 읽어 반영)
    updateForceStartUI(isOn) {
        if (this.toggleForceStart.checked !== isOn) {
            this.toggleForceStart.checked = isOn;
        }
    }

    // [흐름] 준비 버튼 상태 UI 갱신
    updateReadyButtonUI(isReady) {
        if (isReady) {
            this.btnReady.innerText = '준비 취소';
            this.btnReady.classList.replace('btn-secondary', 'btn-primary');
        } else {
            this.btnReady.innerText = '준비';
            this.btnReady.classList.replace('btn-primary', 'btn-secondary');
        }
    }

    // [흐름] 닉네임 입력창
    initNicknameInput(nickname) { this.inputNickname.value = nickname; }
    getNicknameInput()          { return this.inputNickname.value.trim(); }

    showNicknameStatus(message, isError = false) {
        this.nicknameStatus.innerText   = message;
        this.nicknameStatus.style.color = isError ? 'var(--danger)' : 'var(--accent)';
        setTimeout(() => { this.nicknameStatus.innerText = ''; }, 2000);
    }

    // [흐름] 실시간 순위표 렌더링
    renderLeaderboard(players, myId) {
        const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
        this.leaderboard.innerHTML = '<strong>🏆 실시간 순위</strong>';
        sorted.forEach((p, i) => {
            const row         = document.createElement('div');
            const isMe        = p.id === myId;
            const displayName = isMe ? `${p.nickname || p.id} (나)` : (p.nickname || p.id);
            row.innerText = `${i + 1}. ${displayName} (${p.score || 0})`;
            if (isMe) { row.style.color = 'var(--highlight)'; row.style.fontWeight = 'bold'; }
            if (p.isLeaving) row.style.textDecoration = 'line-through';
            this.leaderboard.appendChild(row);
        });
    }

    // [흐름] 타이머·점수 갱신
    updateStats(time, score) {
        this.uiTime.innerText  = `Time: ${time}`;
        this.uiScore.innerText = `Score: ${score}`;
    }

    // [흐름] 게임 보드 최초 1회 생성
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

    // [흐름] 파괴된 셀 개별 업데이트 (팝 애니메이션 포함)
    updateCell(index, tileIndex) {
        const cell = this.gameBoard.children[index];
        if (!cell) return;

        if (tileIndex === null) {
            const snapshot = cell.dataset.color;
            cell.classList.add('tile-pop');
            setTimeout(() => {
                cell.classList.remove('tile-pop');
                // 애니메이션 도중 외부 변경이 없었을 때만 빈 셀로 전환
                if (cell.dataset.color === snapshot) this._applyCell(cell, null);
            }, 150);
        } else {
            this._applyCell(cell, tileIndex);
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

    // [흐름] 리플레이 슬라이더 초기화 및 드래그 콜백 연결
    setupReplaySlider(maxSteps, onChangeCallback) {
        this.replaySlider.max     = maxSteps;
        this.replaySlider.value   = 0;
        this.replaySlider.oninput = (e) => onChangeCallback(parseInt(e.target.value, 10));
    }

    // [흐름] 슬라이더 위치 갱신
    updateReplaySlider(step) { this.replaySlider.value = step; }

    // [흐름] 리플레이 미니 보드 초기 세팅
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

    // [흐름] 특정 시점의 보드 상태를 미니 보드에 전체 덮어쓰기
    redrawReplayBoard(gridData) {
        Array.from(this.replayBoard.children).forEach((cell, index) => {
            this._applyCell(cell, gridData[index]);
            cell.style.transform = 'scale(1)';
        });
    }

    // [흐름] 리플레이 타이머·점수 갱신
    updateReplayStats(time, score) {
        this.replayTime.innerText  = `Time: ${time}`;
        this.replayScore.innerText = `Score: ${score}`;
    }

    // [내부] 셀 스타일 공통 적용
    // tileIndex: 숫자(0~9) = 타일 있음, null = 빈 칸
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

    // [내부] 이모지 모드 토글 시 특정 보드의 전체 셀 텍스트 갱신
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

        // 리플레이 상태
        this.myActionHistory    = [];
        this.currentSeed        = null;
        this.replayInterval     = null;
        this.selectedPlayerData = null;
        this.replayStep         = 0;

        this.ui.initTheme();
        this.ui.initThemeSelector();
        this.bindEvents();
        this.setupNetworkCallbacks();
        this.checkUrlAndAutoJoin();
    }

    // [흐름] 이벤트 바인딩 — 앱 초기화 시 1회 실행
    bindEvents() {
        document.getElementById('btn-create-room')  .addEventListener('click',   () => this.handleCreateRoom());
        document.getElementById('btn-join-room')    .addEventListener('click',   () => this.handleJoinRoom());
        document.getElementById('btn-leave-room')   .addEventListener('click',   () => this.handleLeaveRoom());
        document.getElementById('btn-ready')        .addEventListener('click',   () => this.handleReadyToggle());
        document.getElementById('btn-start')        .addEventListener('click',   () => this.handleGameStart());
        document.getElementById('btn-save-nickname').addEventListener('click',   () => this.handleSaveNickname());
        document.getElementById('input-nickname')   .addEventListener('keydown', (e) => { if (e.key === 'Enter') this.handleSaveNickname(); });
        // 🚀 [추가] 랜덤 입장 버튼 이벤트 연결
        document.getElementById('btn-quick-join')?.addEventListener('click', () => this.handleQuickJoin());

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

        // 테마 변경 시 활성 팔레트 교체 후 보드 전체 리렌더
        this.ui.selectTheme?.addEventListener('change', (e) => {
            GameConfig.activePaletteId = e.target.value;
            if (this.board) this.ui.initBoard(this.board.grid);
            if (this.selectedPlayerData) this.goToReplayStep(this.replayStep);
        });

        // 강제 시작 토글
        this.ui.toggleForceStart?.addEventListener('change', (e) => this.handleForceStartToggle(e.target.checked));

        // 창 닫기/새로고침 시 나가기 처리
        window.addEventListener('beforeunload', () => {
            if (this.roomManager.currentRoomCode) this.network.disconnect();
        });
    }

    // 🚀 [추가] 랜덤 입장 흐름
    async handleQuickJoin() {
        const roomCode = await this.network.getRandomRoomFromDB();
        
        if (!roomCode) {
            alert('현재 대기 중인 방이 없습니다. 직접 방을 만들어보세요!');
            return;
        }
        
        // 찾은 방 코드를 입력창에 넣고, 접속 흐름을 그대로 태웁니다.
        this.ui.inputRoomCode.value = roomCode;
        await this.handleJoinRoom();
    }

    // [흐름] 방장이 강제 시작 토글을 변경했을 때 Presence에 반영
    handleForceStartToggle(isOn) {
        if (!this.roomManager.isHost) return;
        const me = this.roomManager.players.find(p => p.id === this.roomManager.myId);
        if (me) {
            this.network.updateMyState({ ...me, isForceStartOn: isOn, updatedAt: Date.now() });
        }
    }

    // [흐름] 네트워크 콜백 설정
    setupNetworkCallbacks() {
        this.network.onSyncState = (playersData) => {
            this.roomManager.syncPlayers(playersData);
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
            this._refreshPlayerView();
        };

        this.network.onPlayerKicked = (targetId) => {
            if (targetId === this.roomManager.myId) {
                alert('방장에 의해 추방되었습니다.');
                this.handleLeaveRoom();
            } else {
                this.roomManager.markPlayerAsLeft(targetId);
                this._refreshPlayerView();
            }
        };
    }

    // [내부] 게임 중/대기 중 상태에 따라 적절한 뷰 갱신
    _refreshPlayerView() {
        if (this.isGameRunning) {
            this.ui.renderLeaderboard(this.roomManager.players, this.roomManager.myId);
        } else {
            this.ui.renderPlayers(
                this.roomManager.players,
                this.roomManager.myId,
                this.roomManager.isHost,
                (targetId) => this.handleForceResetNickname(targetId),
                (targetId) => this.handleKickPlayer(targetId)
            );
            const host = this.roomManager.players.find(p => p.isHost);
            if (host) this.ui.updateForceStartUI(!!host.isForceStartOn);
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
        this.ui.setupButtons(isHost);
        this.ui.updateRoomView(code, isHost);
        this.ui.initNicknameInput(this.roomManager.myNickname);
        this._refreshPlayerView();
        this.ui.switchScreen('screen-room');
    }

    // [흐름] URL 쿼리스트링으로 자동 방 접속
    async checkUrlAndAutoJoin() {
        const params   = new URLSearchParams(window.location.search);
        const roomCode = params.get('room');
        if (roomCode && roomCode.length === 4) {
            this.ui.inputRoomCode.value = roomCode.toUpperCase();
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
        const newCode = this.roomManager.generateRoomCode();
        try {
            await this.network.connectToRoom(newCode, {
                id:       this.roomManager.myId,
                nickname: this.roomManager.myNickname,
                isHost:   true,
            });
            this.roomManager.setRoomState(newCode, true);
            this.roomManager.addPlayer(this.roomManager.myId, true);

            // 🚀 DB에 내 방 코드를 올림 (모집 시작)
            await this.network.registerRoomToDB(newCode);

            this._enterRoom(newCode, true);
        } catch {
            alert('방 생성에 실패했습니다. 다시 시도해주세요.');
        }
    }

    // [흐름] 방 접속 — 없는 방이면 모달로 선택지 제공
    async handleJoinRoom() {
        const code = this.ui.getInputValue();
        if (code.length !== 4) { alert('4자리 방 코드를 정확히 입력해주세요.'); return; }

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
                this.ui.showRoomNotFoundModal(
                    async () => {
                        try {
                            await this.network.connectToRoom(code, {
                                id:       this.roomManager.myId,
                                nickname: this.roomManager.myNickname,
                                isHost:   true,
                            });
                            this.roomManager.setRoomState(code, true);
                            this.roomManager.addPlayer(this.roomManager.myId, true);
                            this._enterRoom(code, true);
                        } catch {
                            alert('방 생성에 실패했습니다. 다시 시도해주세요.');
                        }
                    },
                    () => {} // 나가기 — 모달만 닫고 로비 유지
                );
            } else {
                alert('방 접속에 실패했습니다. 다시 시도해주세요.');
            }
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

        // 게스트가 없으면(방장 혼자) 항상 시작 가능
        if (guests.length === 0) { this._doStartGame(); return; }

        // 게스트가 있을 때: 강제 시작 또는 전원 준비 필요
        if (!isForceStart && !guests.every(p => p.isReady)) {
            alert('모든 참가자가 준비를 완료해야 시작할 수 있습니다.\n또는 [강제 시작] 설정을 켜주세요.');
            return;
        }

        this._doStartGame();
    }

    // [내부] 실제 게임 시작 신호 전파 및 로컬 실행
    _doStartGame() {
        // 🚀 모집이 끝났으므로 DB에서 방 코드를 내림
        if (this.roomManager.isHost) {
            this.network.unregisterRoomFromDB(this.roomManager.currentRoomCode);
        }

        const seed = generateSeed(GameConfig);
        this.network.broadcastGameStart(seed);
        this.startGameProcess(seed);
    }

    // [흐름] 게임 초기화 및 화면 전환
    startGameProcess(seed) {
        this.isGameRunning   = true;
        this.currentSeed     = seed;
        this.myActionHistory = [];

        this.board      = new Board(GameConfig);
        this.board.initializeWithSeed(seed);
        this.scoreTimer = new ScoreTimer(GameConfig);

        const me = this.roomManager.players.find(p => p.id === this.roomManager.myId);
        if (me) this.network.updateMyState({ ...me, score: 0, isReady: false, updatedAt: Date.now() });

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

        // 성공/실패 모두 점수·기록 갱신
        this.ui.updateStats(this.scoreTimer.time, this.scoreTimer.score);

        this.myActionHistory.push({
            timeLeft:     this.scoreTimer.time,
            indexClicked: index,
            currentScore: this.scoreTimer.score,
        });

        const me = this.roomManager.players.find(p => p.id === this.roomManager.myId);
        if (me) {
            this.network.updateMyState({
                ...me,
                score:     this.scoreTimer.score,
                history:   this.myActionHistory,
                updatedAt: Date.now(),
            });
        }
    }

    // [흐름] 게임 종료 처리
    endGame() {
        const finalScore = this.scoreTimer?.score ?? 0;
        this.isGameRunning = false;
        this.scoreTimer?.stop();
        this.board      = null;
        this.scoreTimer = null;

        this.ui.renderResultBoard(this.roomManager.players, this.roomManager.myId, (selectedPlayer) => {
            this.selectedPlayerData = selectedPlayer;
            this.pauseReplay();
            const historyCount = selectedPlayer.history?.length ?? 0;
            this.ui.setupReplayUI(selectedPlayer, this.currentSeed);
            this.ui.setupReplaySlider(historyCount, (step) => {
                this.pauseReplay();
                this.goToReplayStep(step);
            });
            this.goToReplayStep(historyCount);
        });

        // 게스트는 결과창을 보는 동안 다른 사람 화면에서 투명인간 처리
        if (!this.roomManager.isHost) {
            this.network.updateMyState({
                id:        this.roomManager.myId,
                nickname:  this.roomManager.myNickname,
                isHost:    false,
                isReady:   false,
                isLeaving: true,
                score:     finalScore,
                history:   this.myActionHistory,
                updatedAt: Date.now(),
            });
        }

        this.ui.switchScreen('screen-result');
    }

    // [흐름] 지정 시점(step)의 보드 상태를 계산 후 즉시 렌더링
    goToReplayStep(step) {
        if (!this.selectedPlayerData || !this.currentSeed) return;

        this.replayStep = step;
        this.ui.updateReplaySlider(step);

        const replayBoard = new Board(GameConfig);
        replayBoard.initializeWithSeed(this.currentSeed);

        const actions = this.selectedPlayerData.history || [];
        let currentScore = 0;
        let currentTime  = GameConfig.timeLimit;

        for (let i = 0; i < step; i++) {
            const action      = actions[i];
            const targetTiles = replayBoard.getMatchedTilesToDestroy(action.indexClicked);
            targetTiles.forEach(idx => { replayBoard.grid[idx] = null; });
            currentScore = action.currentScore;
            currentTime  = action.timeLeft;
        }

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
        this.pauseReplay();

        this.network.updateMyState({
            id:        this.roomManager.myId,
            nickname:  this.roomManager.myNickname,
            isHost:    this.roomManager.isHost,
            isReady:   false,
            isLeaving: false,
            score:     0,
            history:   [],
            updatedAt: Date.now(),
        });

        this.ui.switchScreen('screen-room');
        this.ui.updateRoomView(this.roomManager.currentRoomCode, this.roomManager.isHost);
        this.ui.setupButtons(this.roomManager.isHost);
        this.ui.updateReadyButtonUI(false);
        this._refreshPlayerView();
    }

    // [흐름] 방 퇴장 — 화면 전환 우선, 통신은 백그라운드 처리
    async handleLeaveRoom() {
        // 🚀 방장이라면 DB에 올려둔 방 코드를 회수함
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