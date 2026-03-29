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
        const ctx  = this._getContext();
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
        this.roomTitle      = document.getElementById('room-title');
        this.btnCopyLink    = document.getElementById('btn-copy-link'); // 🚀 [추가] 링크 복사 버튼 연결
        this.roomStatus     = document.getElementById('room-status');
        this.playerList     = document.getElementById('player-list');
        this.btnReady       = document.getElementById('btn-ready');
        this.btnStart       = document.getElementById('btn-start');
        this.inputNickname  = document.getElementById('input-nickname');
        this.nicknameStatus = document.getElementById('nickname-status');

        // 게임
        this.uiTime          = document.getElementById('ui-time');
        this.uiScore         = document.getElementById('ui-score');
        this.leaderboard     = document.getElementById('leaderboard');
        this.gameBoard       = document.getElementById('game-board');
        this.toggleEmoji     = document.getElementById('toggle-emoji');

        // 결과
        this.resultLeaderboard = document.getElementById('result-leaderboard');
        this.replayTitle       = document.getElementById('replay-title');
        this.replayContent     = document.getElementById('replay-content');
        this.replayBoard       = document.getElementById('replay-board');
        this.replayTime        = document.getElementById('replay-time');
        this.replayScore       = document.getElementById('replay-score');
        this.replaySlider      = document.getElementById('replay-slider');
        this.btnPlayReplay     = document.getElementById('btn-play-replay');
        this.btnBackToRoom     = document.getElementById('btn-back-to-room');
        this.toggleEmojiReplay = document.getElementById('toggle-emoji-replay');

        this.isEmojiMode = false;

        // 모달
        this.modalRoomNotFound = document.getElementById('modal-room-not-found');

        // 🚀 [추가] 버전 표시 및 업데이트 로그 모달 요소
        this.btnVersion        = document.getElementById('btn-version');
        this.modalChangelog    = document.getElementById('modal-changelog');
        this.btnChangelogClose = document.getElementById('modal-btn-close-changelog');
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

    // [흐름] 방 없음 모달 표시
    showRoomNotFoundModal(onCreateCallback, onCancelCallback) {
        this.modalRoomNotFound.style.display = 'flex';

        // 버튼마다 콜백 연결 (1회용 — 중복 방지를 위해 clone으로 교체)
        const btnCreate = this.modalRoomNotFound.querySelector('#modal-btn-create');
        const btnCancel = this.modalRoomNotFound.querySelector('#modal-btn-cancel');

        const freshCreate = btnCreate.cloneNode(true);
        const freshCancel = btnCancel.cloneNode(true);
        btnCreate.replaceWith(freshCreate);
        btnCancel.replaceWith(freshCancel);

        freshCreate.addEventListener('click', () => {
            this.hideRoomNotFoundModal();
            onCreateCallback();
        });
        freshCancel.addEventListener('click', () => {
            this.hideRoomNotFoundModal();
            onCancelCallback();
        });
    }

    hideRoomNotFoundModal() {
        this.modalRoomNotFound.style.display = 'none';
    }

    // [흐름] 화면 전환
    switchScreen(screenId) {
        [this.screenLobby, this.screenRoom, this.screenGame, this.screenResult]
            .forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    }

    // [흐름] 대기실 헤더 갱신
    updateRoomView(roomCode, isHost) {
        this.roomTitle.innerText  = `방 코드: [ ${roomCode} ]`;
        this.roomStatus.innerText = isHost
            ? '당신은 방장입니다. 다른 플레이어를 기다리는 중...'
            : '방에 접속했습니다. 시작을 기다리는 중...';
    }

    // [흐름] 로비 입력값
    getInputValue() { return this.inputRoomCode.value.trim().toUpperCase(); }
    clearInput()    { this.inputRoomCode.value = ''; }

    // 🚀 [수정] onKickClickCallback 파라미터 추가 및 UI 간소화
    renderPlayers(players, myId, isHost, onResetClickCallback, onKickClickCallback) {
        this.playerList.innerHTML = '';
        players.forEach(p => {
            const li = document.createElement('li');
            const name = p.nickname || p.id;
            let text = name;
            if (p.id === myId) text += ' (나)';
            if (p.isHost) text += ' 👑 방장';
            else text += p.isReady ? ' ✅ 준비완료' : ' ⏳ 대기중';

            const textSpan = document.createElement('span');
            textSpan.innerText = text;
            li.appendChild(textSpan);

            // 🚀 [수정] 방장 전용 관리 버튼 (이름 초기화 + 추방)
            if (isHost && p.id !== myId) {
                const actionDiv = document.createElement('div');
                actionDiv.className = 'player-actions';

                // 간소화된 닉네임 초기화 버튼
                const resetBtn = document.createElement('button');
                resetBtn.innerText = '🔄 이름';
                resetBtn.className = 'btn-action btn-reset';
                resetBtn.addEventListener('click', () => {
                    if (confirm(`[ ${name} ] 님의 닉네임을 초기화하시겠습니까?`)) onResetClickCallback(p.id);
                });

                // 강렬한 추방 버튼
                const kickBtn = document.createElement('button');
                kickBtn.innerText = '⛔ 추방';
                kickBtn.className = 'btn-action btn-kick';
                kickBtn.addEventListener('click', () => {
                    if (confirm(`[ ${name} ] 님을 방에서 추방하시겠습니까?`)) onKickClickCallback(p.id);
                });

                actionDiv.appendChild(resetBtn);
                actionDiv.appendChild(kickBtn);
                li.appendChild(actionDiv);
            }

            this.playerList.appendChild(li);
        });
    }

    // [흐름] 방장/게스트 버튼 분기
    setupButtons(isHost) {
        this.btnReady.style.display = isHost ? 'none'  : 'block';
        this.btnStart.style.display = isHost ? 'block' : 'none';
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
            const row = document.createElement('div');
            // 이름 뒤에 (나) 추가
            let displayName = p.nickname || p.id;
            if (p.id === myId) displayName += ' (나)';
            
            row.innerText = `${i + 1}. ${displayName} (${p.score || 0})`;
            
            // 본인일 경우 눈에 띄게 색상 변경
            if (p.id === myId) {
                row.style.color = 'var(--highlight)';
                row.style.fontWeight = 'bold';
            }
            
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
        gridData.forEach((color, index) => {
            const cell = document.createElement('div');
            cell.dataset.index = index;
            cell.className = 'tile';
            this._applyCell(cell, color);
            this.gameBoard.appendChild(cell);
        });
    }

    // [흐름] 파괴된 셀 개별 업데이트 (팝 애니메이션 포함)
    updateCell(index, color) {
        const cell = this.gameBoard.children[index];
        if (!cell) return;

        if (!color) {
            const snapshot = cell.dataset.color;
            cell.classList.add('tile-pop');
            setTimeout(() => {
                cell.classList.remove('tile-pop');
                if (!cell.dataset.color || cell.dataset.color === snapshot) {
                    this._applyCell(cell, null);
                }
            }, 150);
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

    // 🚀 [수정] 파라미터 맨 끝에 myId 추가
    renderResultBoard(players, onSelectCallback, myId) {
        const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
        this.resultLeaderboard.innerHTML = '';
        this.replayTitle.innerText       = '🔍 복기할 플레이어를 선택하세요';
        this.replayContent.style.display = 'none';

        sorted.forEach((p, i) => {
            const card = document.createElement('div');
            card.className = i === 0 ? 'result-card first-place' : 'result-card';
            
            // 이름 뒤에 (나) 추가
            let displayName = p.nickname || p.id;
            if (p.id === myId) displayName += ' (나)';
            
            card.innerText = `${i + 1}등: ${displayName} (${p.score || 0}점) ${i === 0 ? '👑' : ''}`;
            
            // 본인일 경우 테두리나 글씨체로 살짝 강조
            if (p.id === myId && i !== 0) {
                card.style.borderLeft = '3px solid var(--highlight)';
            }
            
            card.addEventListener('click', () => {
                Array.from(this.resultLeaderboard.children)
                    .forEach(c => c.style.borderColor = 'transparent');
                card.style.borderColor = 'var(--primary)';
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
        this.replayTitle.innerText = `[ ${playerData.nickname || playerData.id} ] 님의 플레이`;
        this.replayContent.style.display = 'flex';
        this.replayTime.innerText = 'Time: 120';
        this.replayScore.innerText = 'Score: 0';

        this.replayBoard.innerHTML = '';
        initialSeed.forEach((color) => {
            const cell = document.createElement('div');
            cell.className = 'mini-tile';
            cell.dataset.color = color || '';
            // 🚀 강제 'transparent' 제거 (CSS에게 디자인 위임)
            cell.style.backgroundColor = color || '';
            cell.innerText = (color && this.isEmojiMode) ? GameConfig.emojis[color] : '';
            this.replayBoard.appendChild(cell);
        });
    }

    // [흐름] 특정 시점의 보드 상태를 미니 보드에 전체 덮어쓰기
    redrawReplayBoard(gridData) {
        Array.from(this.replayBoard.children).forEach((cell, index) => {
            const color = gridData[index];
            cell.dataset.color         = color || '';
            // 🚀 강제 'transparent' 제거 (CSS에게 디자인 위임)
            cell.style.backgroundColor = color || ''; 
            cell.style.transform       = 'scale(1)';
            cell.innerText = (color && this.isEmojiMode) ? GameConfig.emojis[color] : '';
        });
    }

    // [흐름] 리플레이 타이머·점수 갱신
    updateReplayStats(time, score) {
        this.replayTime.innerText  = `Time: ${time}`;
        this.replayScore.innerText = `Score: ${score}`;
    }

    // [내부] 셀 스타일 공통 적용
    _applyCell(cell, color) {
        cell.dataset.color = color || '';
        if (color) {
            cell.style.backgroundColor = color;
            cell.style.cursor          = 'default';
            cell.innerText = this.isEmojiMode ? GameConfig.emojis[color] : '';
        } else {
            // 🚀 강제 'transparent' 제거 (CSS에게 디자인 위임)
            cell.style.backgroundColor = ''; 
            cell.style.boxShadow       = '';
            cell.style.cursor          = 'pointer';
            cell.innerText             = '';
        }
    }

    // [내부] 이모지 모드 토글 시 특정 보드의 전체 셀 텍스트 갱신
    _refreshBoard(board) {
        if (!board) return;
        Array.from(board.children).forEach(cell => {
            const color = cell.dataset.color;
            cell.innerText = (color && this.isEmojiMode) ? GameConfig.emojis[color] : '';
        });
    }

    showChangelog() { this.modalChangelog.style.display = 'flex'; }
    hideChangelog() { this.modalChangelog.style.display = 'none'; }
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

        this.ui.bindBoardClick((index) => this.handleCellClick(index));
        this.ui.bindToggleEvents();
        this.ui.btnBackToRoom .addEventListener('click', () => this.handleBackToRoom());
        this.ui.btnPlayReplay .addEventListener('click', () => {
            this.replayInterval ? this.pauseReplay() : this.startReplaySimulation();
        });

        // 🚀 [추가] 버전 뱃지 클릭 시 모달 열기, 닫기 버튼 클릭 시 모달 닫기
        this.ui.btnVersion?.addEventListener('click', () => this.ui.showChangelog());
        this.ui.btnChangelogClose?.addEventListener('click', () => this.ui.hideChangelog());

        this.ui.btnCopyLink?.addEventListener('click', () => this.handleCopyLink());
    }

    handleCopyLink() {
        const code = this.roomManager.currentRoomCode;
        if (!code) return;

        const inviteLink = `${window.location.origin}${window.location.pathname}?room=${code}`;

        navigator.clipboard.writeText(inviteLink).then(() => {
            alert('🔗 초대 링크가 복사되었습니다!\n친구에게 공유해보세요.');
        }).catch(() => {
            alert('복사에 실패했습니다. 브라우저 권한을 확인해주세요.');
        });
    }

    // 🚀 [추가 4] 주소창을 읽어 자동 접속하는 로직
    async checkUrlAndAutoJoin() {
        const params = new URLSearchParams(window.location.search);
        const roomCode = params.get('room');

        // 주소창에 ?room=ABCD 형태로 4자리 코드가 있다면
        if (roomCode && roomCode.length === 4) {
            // 입력창에 코드를 몰래 적어두고
            this.ui.inputRoomCode.value = roomCode.toUpperCase();
            
            // 방 접속 버튼을 누른 것과 똑같이 실행
            await this.handleJoinRoom();

            // 새로고침 시 계속 접속되는 것을 막기 위해 주소창에서 ?room=ABCD 꼬리표 떼기
            window.history.replaceState({}, document.title, window.location.pathname);
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
            if (me) {
                this.network.updateMyState({ ...me, nickname: this.roomManager.myId, updatedAt: Date.now() });
            }
        };

        this.network.onPlayerLeft = (leftId) => {
            this.roomManager.markPlayerAsLeft(leftId);
            this._refreshPlayerView();
        };

        this.network.onPlayerKicked = (targetId) => {
            if (targetId === this.roomManager.myId) {
                // 내가 추방당한 경우: 알림창 띄우고 강제 퇴장 처리
                alert('방장에 의해 추방되었습니다.');
                this.handleLeaveRoom();
            } else {
                // 남이 추방당한 경우: 서버 딜레이를 기다리지 않고 내 화면에서 즉시 삭제
                this.roomManager.markPlayerAsLeft(targetId);
                this._refreshPlayerView();
            }
        };
    }

    // 🚀 [수정] renderPlayers 호출 시 추방 콜백(handleKickPlayer) 넘겨주기
    _refreshPlayerView() {
        if (this.isGameRunning) {
            this.ui.renderLeaderboard(this.roomManager.players, this.roomManager.myId);
        } else {
            this.ui.renderPlayers(
                this.roomManager.players,
                this.roomManager.myId,
                this.roomManager.isHost,
                (targetId) => this.handleForceResetNickname(targetId),
                (targetId) => this.handleKickPlayer(targetId) // <--- 추방 로직 추가!
            );
        }
    }

    // 🚀 [추가] 방장이 추방 버튼을 눌렀을 때 실행되는 메서드
    handleKickPlayer(targetId) {
        this.network.broadcastKickPlayer(targetId);
    }

    // [내부] renderPlayers 호출 시 콜백을 항상 동일하게 넘기는 헬퍼
    _renderPlayersWithCallback() {
        this.ui.renderPlayers(
            this.roomManager.players,
            this.roomManager.myId,
            this.roomManager.isHost,
            (targetId) => this.handleForceResetNickname(targetId)
        );
    }

    // [흐름] 방장이 닉네임 초기화 명령 전파
    handleForceResetNickname(targetId) {
        this.network.broadcastForceNicknameReset(targetId);
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

            this.ui.setupButtons(true);
            this._renderPlayersWithCallback();
            this.ui.updateRoomView(newCode, true);
            this.ui.initNicknameInput(this.roomManager.myNickname);
            this.ui.switchScreen('screen-room');

        } catch {
            alert('방 생성에 실패했습니다. 다시 시도해주세요.');
        }
    }

    // [흐름] 방 접속 — 존재하지 않는 코드면 에러 알림 후 종료
    async handleJoinRoom() {
        const code = this.ui.getInputValue();
        if (code.length !== 4) { alert('4자리 방 코드를 정확히 입력해주세요.'); return; }

        try {
            await this.network.connectToRoom(code, {
                id: this.roomManager.myId,
                nickname: this.roomManager.myNickname,
                isHost: false,
                isReady: false,
            });

            this.roomManager.setRoomState(code, false);
            this.ui.setupButtons(false);
            this.ui.updateRoomView(code, false);
            this.ui.initNicknameInput(this.roomManager.myNickname);
            this.ui.switchScreen('screen-room');

        } catch (error) {
            this.roomManager.clearRoomState();

            if (error.message === 'ROOM_NOT_FOUND') {
                // 방 생성 버튼 → 해당 코드로 방장 자격 재접속
                this.ui.showRoomNotFoundModal(
                    async () => {
                        try {
                            await this.network.connectToRoom(code, {
                                id: this.roomManager.myId,
                                nickname: this.roomManager.myNickname,
                                isHost: true,
                            });
                            this.roomManager.setRoomState(code, true);
                            this.roomManager.addPlayer(this.roomManager.myId, true);
                            this.ui.setupButtons(true);
                            this._renderPlayersWithCallback();
                            this.ui.updateRoomView(code, true);
                            this.ui.initNicknameInput(this.roomManager.myNickname);
                            this.ui.switchScreen('screen-room');
                        } catch {
                            alert('방 생성에 실패했습니다. 다시 시도해주세요.');
                        }
                    },
                    () => { } // 나가기 — 모달만 닫고 로비 유지
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
        this._renderPlayersWithCallback();

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
        const guests   = this.roomManager.players.filter(p => !p.isHost);
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

        // 성공/실패 모두 점수 갱신 및 기록
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
        this.isGameRunning = false;
        this.scoreTimer.stop();
        this.board      = null;
        this.scoreTimer = null;

        this.ui.renderResultBoard(this.roomManager.players, (selectedPlayer) => {
            this.selectedPlayerData = selectedPlayer;
            this.pauseReplay();

            const historyCount = selectedPlayer.history?.length ?? 0;
            this.ui.setupReplayUI(selectedPlayer, this.currentSeed);
            this.ui.setupReplaySlider(historyCount, (step) => {
                this.pauseReplay();
                this.goToReplayStep(step);
            });
            this.goToReplayStep(historyCount);
        }, this.roomManager.myId); // <--- 여기에 myId 추가

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

        const me = this.roomManager.players.find(p => p.id === this.roomManager.myId);
        if (me) {
            this.network.updateMyState({
                ...me, score: 0, history: [], isReady: false, updatedAt: Date.now(),
            });
        }

        this.ui.switchScreen('screen-room');
        this.ui.updateRoomView(this.roomManager.currentRoomCode, this.roomManager.isHost);
        this.ui.setupButtons(this.roomManager.isHost);
        this._renderPlayersWithCallback();
    }

    // [흐름] 방 퇴장 — 화면 전환 우선, 통신은 백그라운드 처리
    async handleLeaveRoom() {
        this.ui.clearInput();
        this.ui.switchScreen('screen-lobby');
        await this.network.disconnect();
        this.roomManager.clearRoomState();
    }
}

window.onload = () => { new AppController(); };