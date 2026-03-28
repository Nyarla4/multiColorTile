/**
 * js/main.js
 * 역할: [흐름] 애플리케이션 진입점, 화면 전환 관리
 */

const CONFIG = {
    SUPABASE_URL: 'https://mhoscqcewmrorfxcewsn.supabase.co',
    SUPABASE_KEY: 'sb_publishable_2e33xf0hNMg3sP4xNTIiwQ_HGhFFu12'
};

const appState = {
    userId: 'USER_' + Math.random().toString(36).substr(2, 9),
    nickname: '',
    isHost: false,
    roomId: null,
    isReady: false
};

const views = {
    start: document.getElementById('start-view'),
    lobby: document.getElementById('lobby-view'),
    game: document.getElementById('game-view'),
    result: document.getElementById('result-view')
};

const ui = {
    roomActionArea: document.getElementById('room-action-area'),
    roomCodeInput: document.getElementById('room-code-input'),
    btnJoinRoom: document.getElementById('btn-join-room'),
    myNicknameDisplay: document.getElementById('my-nickname-display'),
    roomDetailArea: document.getElementById('room-detail-area'),
    displayRoomCode: document.getElementById('display-room-code'),
    playerList: document.getElementById('player-list'),
    inRoomNickname: document.getElementById('in-room-nickname'),
    btnUpdateNickname: document.getElementById('btn-update-nickname'),
    btnStartGame: document.getElementById('btn-start-game'),
    btnReady: document.getElementById('btn-ready'),
    btnReturnRoom: document.getElementById('btn-return-room'),
    liveRanking: document.getElementById('live-ranking'),
    timeLeft: document.getElementById('time-left'),
    rematchPopup: document.getElementById('rematch-popup'),
    startNicknameInput: document.getElementById('start-nickname-input'),
    btnSetNickname: document.getElementById('btn-set-nickname'),
    currentNicknameDisplay: document.getElementById('current-nickname-display'),
};

function switchView(targetViewId) {
    Object.values(views).forEach(v => {
        v.classList.add('hidden');
        v.classList.remove('active');
    });
    if (views[targetViewId]) {
        views[targetViewId].classList.remove('hidden');
        views[targetViewId].classList.add('active');
    }
}

function toggleRoomDetail(show) {
    if (show) {
        ui.roomActionArea.classList.add('hidden');
        ui.roomDetailArea.classList.remove('hidden');
        if (ui.displayRoomCode) ui.displayRoomCode.innerText = appState.roomId;

        if (appState.isHost) {
            ui.btnStartGame.classList.remove('hidden');
            ui.btnReady.classList.add('hidden');
        } else {
            ui.btnStartGame.classList.add('hidden');
            ui.btnReady.classList.remove('hidden');
        }
    } else {
        ui.roomActionArea.classList.remove('hidden');
        ui.roomDetailArea.classList.add('hidden');
        if (ui.roomCodeInput) ui.roomCodeInput.value = '';
    }
}

function getMyPresenceState() {
    return {
        userId: appState.userId,
        nickname: appState.nickname,
        score: 0,
        isReady: appState.isReady,
        isHost: appState.isHost
    };
}

function refreshLiveRanking() {
    if (!ui.liveRanking) return;
    const sorted = Array.from(networkManager.players.values())
        .sort((a, b) => b.score - a.score);
    ui.liveRanking.innerHTML = sorted
        .map((p, i) => `<li>${i + 1}. ${p.nickname || '(없음)'} — ${p.score}점</li>`)
        .join('');
}

function showResult(finalScores) {
    switchView('result');
    if (appState.isHost) {
        ui.btnReturnRoom.classList.remove('hidden');
    } else {
        ui.btnReturnRoom.classList.add('hidden');
    }
    const sorted = [...finalScores].sort((a, b) => b.score - a.score);
    document.getElementById('final-ranking').innerHTML = sorted
        .map((p, i) => `<p>${i + 1}위 — ${p.nickname || '(닉네임 없음)'} : ${p.score}점</p>`)
        .join('');
}

function initEvents() {
    // [구조] 게임 종료 시 호출될 콜백을 흐름과 관계없이 사전에 구조적으로 연결합니다.
    gameInstance.onGameEnded = showResult;

    gameInstance.onScoreChanged = (newScore) => {
        if (networkManager.players.has(appState.userId)) {
            networkManager.players.get(appState.userId).score = newScore;
        }
        refreshLiveRanking();
        networkManager.sendScore(appState.userId, newScore);
    };

    networkManager.onPlayerListUpdated = (players) => {
        ui.playerList.innerHTML = '';
        players.forEach(p => {
            const li = document.createElement('li');
            const isMe = p.userId === appState.userId;
            let statusText = p.isHost ? '방장' : (p.isReady ? '준비완료' : '대기중');
            let statusColor = p.isHost ? 'var(--primary)' : (p.isReady ? 'var(--accent)' : 'var(--text-muted)');
            li.innerHTML = `
                <span style="font-weight: bold; color: ${isMe ? 'var(--primary)' : 'inherit'}">
                    ${p.nickname} ${isMe ? '(나)' : ''}
                </span>
                <span style="color: ${statusColor}; font-weight: bold; font-size: 0.9em;">
                    ${statusText}
                </span>
            `;
            ui.playerList.appendChild(li);
        });
    };

    networkManager.onGameStarted = (seed) => {
        switchView('game');
        // [흐름] 게임 실행에 필요한 컨텍스트(isHost)를 매개변수로 주입합니다.
        gameInstance.initGame(seed, appState.isHost); 
    };

    networkManager.onGameEndedBroadcast = (finalScores) => {
        // 1. 구조 제어: 게임 내부의 타이머와 동작만 중지시킵니다. (매개변수 없음)
        gameInstance.forceEnd();

        // 2. 흐름 제어: 전달받은 최종 점수를 가지고 main.js가 직접 결과 화면을 띄웁니다.
        showResult(finalScores);
    };

    networkManager.onRematchRequested = (newRoomId) => {
        if (!appState.isHost && views.result.classList.contains('active')) {
            appState.roomId = newRoomId;
            ui.rematchPopup.classList.remove('hidden');
        }
    };

    networkManager.onScoreUpdated = (userId, newScore) => {
        if (networkManager.players.has(userId)) {
            networkManager.players.get(userId).score = newScore;
        }
        refreshLiveRanking();
    };

    networkManager.onHostLeft = () => {
        alert('방장이 방을 나갔습니다. 대기실로 돌아갑니다.');
        appState.isHost = false;
        appState.roomId = null;
        appState.isReady = false;
        ui.btnReady.innerText = '준비 완료';
        ui.btnReady.style.backgroundColor = 'var(--primary)';
        networkManager.leaveRoom();
        toggleRoomDetail(false);
    };

    networkManager.onConnectionError = () => {
        alert('서버 연결에 실패했습니다. 대기실로 돌아갑니다.');
        appState.isHost = false;
        appState.roomId = null;
        appState.isReady = false;
        toggleRoomDetail(false);
    };

    ui.btnSetNickname.addEventListener('click', () => {
        const name = ui.startNicknameInput.value.trim();
        appState.nickname = name || ('Guest_' + Math.floor(Math.random() * 1000));
        ui.startNicknameInput.value = '';
        ui.startNicknameInput.placeholder = `현재: ${appState.nickname}`;
        ui.currentNicknameDisplay.textContent = `닉네임 설정됨: ${appState.nickname}`;
        ui.myNicknameDisplay.innerText = `내 닉네임: ${appState.nickname}`;
    });

    document.getElementById('btn-create-room').addEventListener('click', async () => {
        const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const success = await networkManager.createRoomDB(newCode, appState.userId);
        if (success) {
            appState.isHost = true;
            appState.roomId = newCode;
            appState.isReady = true;
            // 비동기 흐름 제어: 방 접속이 완벽히 끝난 후 UI를 전환합니다.
            await networkManager.joinRoom(appState.roomId, appState.userId, getMyPresenceState());
            toggleRoomDetail(true);
        } else {
            alert("방 생성에 실패했습니다.");
        }
    });

    ui.btnJoinRoom.addEventListener('click', async () => {
        const code = ui.roomCodeInput.value.trim().toUpperCase();
        if (code.length !== 6) { alert("6자리 방 코드를 입력해주세요."); return; }
        const isValid = await networkManager.checkRoomDB(code);
        if (isValid) {
            appState.isHost = false;
            appState.roomId = code;
            appState.isReady = false;
            // 비동기 흐름 제어
            await networkManager.joinRoom(appState.roomId, appState.userId, getMyPresenceState());
            toggleRoomDetail(true);
        } else {
            alert("존재하지 않거나 게임이 시작된 방입니다.");
        }
    });

    ui.btnUpdateNickname.addEventListener('click', () => {
        const newName = ui.inRoomNickname.value.trim();
        if (newName) {
            appState.nickname = newName;
            ui.myNicknameDisplay.innerText = `내 닉네임: ${appState.nickname}`;
            ui.inRoomNickname.value = '';
            ui.inRoomNickname.placeholder = `현재 닉네임: ${newName}`;
            networkManager.updatePresenceState(getMyPresenceState());
        }
    });

    ui.btnReady.addEventListener('click', () => {
        appState.isReady = !appState.isReady;
        ui.btnReady.innerText = appState.isReady ? '준비 취소' : '준비 완료';
        ui.btnReady.style.backgroundColor = appState.isReady ? 'var(--danger)' : 'var(--primary)';
        networkManager.updatePresenceState(getMyPresenceState());
    });

    document.getElementById('btn-leave-room').addEventListener('click', async () => {
        const wasHost = appState.isHost;
        const roomId = appState.roomId;

        if (wasHost) {
            networkManager.sendHostLeaving();
            await networkManager.deleteRoomDB(roomId);
        }

        appState.isHost = false;
        appState.roomId = null;
        appState.isReady = false;
        ui.btnReady.innerText = '준비 완료';
        ui.btnReady.style.backgroundColor = 'var(--primary)';

        networkManager.leaveRoom();
        toggleRoomDetail(false);
    });

    ui.btnStartGame.addEventListener('click', () => {
        const playersArray = Array.from(networkManager.players.values());
        const members = playersArray.filter(p => !p.isHost);

        if (members.length === 0) {
            alert("최소 1명 이상의 멤버가 들어와야 게임을 시작할 수 있습니다!");
            return;
        }
        if (!members.every(p => p.isReady)) {
            alert("모든 멤버가 준비를 완료해야 시작할 수 있습니다!");
            return;
        }

        const seed = Math.random();
        networkManager.sendGameStart(seed);
        networkManager.onGameStarted(seed);
        networkManager.updateRoomStatusPlaying(appState.roomId);
    });

    ui.btnReturnRoom.addEventListener('click', async () => {
        const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const success = await networkManager.createRoomDB(newCode, appState.userId);
        if (!success) { alert('방 생성에 실패했습니다.'); return; }

        networkManager.sendRematchRequest(newCode);

        appState.roomId = newCode;
        appState.isReady = true;
        await networkManager.joinRoom(appState.roomId, appState.userId, getMyPresenceState());
        switchView('lobby');
        toggleRoomDetail(true);
    });

    document.getElementById('btn-exit-game').addEventListener('click', () => {
        networkManager.leaveRoom();
        appState.isHost = false;
        appState.roomId = null;
        switchView('lobby');
        toggleRoomDetail(false);
    });

    document.getElementById('btn-popup-return').addEventListener('click', async () => {
        ui.rematchPopup.classList.add('hidden');
        appState.isReady = false;
        await networkManager.joinRoom(appState.roomId, appState.userId, getMyPresenceState());
        switchView('lobby');
        toggleRoomDetail(true);
    });

    document.getElementById('btn-popup-exit').addEventListener('click', () => {
        ui.rematchPopup.classList.add('hidden');
        networkManager.leaveRoom();
        appState.isHost = false;
        appState.roomId = null;
        switchView('lobby');
        toggleRoomDetail(false);
    });

    gameInstance.onTimeUp = (finalHostScore) => {
        // 흐름 제어: 방장의 최종 점수 전송 -> 결과 취합 -> 브로드캐스트 -> UI 전환
        networkManager.sendScore(appState.userId, finalHostScore, true);
        const finalScores = Array.from(networkManager.players.values());
        networkManager.sendGameEnd(finalScores);
        showResult(finalScores);
    };

    // 강제 종료 브로드캐스트 수신 시 (멤버)
    networkManager.onGameEndedBroadcast = (finalScores) => {
        gameInstance.forceEnd(); // finalScores를 game.js에 넘길 필요 없이 게임만 중단시킴
        showResult(finalScores); // 결과 출력은 main.js가 직접 수행
    };
}

window.onload = () => {
    if (typeof networkManager !== 'undefined') {
        networkManager.init(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    }
    appState.nickname = 'Guest_' + Math.floor(Math.random() * 1000);
    if (ui.currentNicknameDisplay) {
        ui.currentNicknameDisplay.textContent = `닉네임 설정됨: ${appState.nickname}`;
    }
    ui.myNicknameDisplay.innerText = `내 닉네임: ${appState.nickname}`;
    initEvents();

    window.addEventListener('beforeunload', () => {
        if (!appState.roomId || !networkManager.currentChannel) return;
        if (appState.isHost) {
            networkManager.sendHostLeaving();
        }
        try { networkManager.currentChannel.untrack(); } catch (e) {}
    });
};