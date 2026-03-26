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
    liveRanking: document.getElementById('live-ranking'),       // 추가
    timeLeft: document.getElementById('time-left'),             // 추가
    rematchPopup: document.getElementById('rematch-popup')
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

// 현재 내 상태를 생성해서 반환하는 헬퍼 함수
function getMyPresenceState() {
    return {
        userId: appState.userId,
        nickname: appState.nickname,
        score: 0,
        isReady: appState.isReady,
        isHost: appState.isHost // 방장 여부를 명시적으로 전달
    };
}

function initEvents() {
    
    // --- 접속자 목록 렌더링 ---
    networkManager.onPlayerListUpdated = (players) => {
        ui.playerList.innerHTML = ''; 
        
        players.forEach(p => {
            const li = document.createElement('li');
            const isMe = p.userId === appState.userId;
            
            // [버그 수정] p.isHost 데이터를 기반으로 명확하게 방장 판별
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
        gameInstance.initGame(seed);

        // 게임 종료 시 결과 화면으로 전환 + 방장 버튼 제어
        gameInstance.onGameEnded = (finalScores) => {
            switchView('result');
            // 방장만 "방 돌아가기" 버튼 표시
            if (appState.isHost) {
                ui.btnReturnRoom.classList.remove('hidden');
            } else {
                ui.btnReturnRoom.classList.add('hidden');
            }
            // 최종 순위 렌더링
            const sorted = finalScores.sort((a, b) => b.score - a.score);
            document.getElementById('final-ranking').innerHTML = sorted
                .map((p, i) => `<p>${i + 1}위 — ${p.nickname || '(닉네임 없음)'} : ${p.score}점</p>`)
                .join('');
        };
    };

    networkManager.onRematchRequested = (newRoomId) => {
        if (!appState.isHost && views.result.classList.contains('active')) {
            ui.rematchPopup.classList.remove('hidden');
        }
    };

    gameInstance.onScoreChanged = (newScore) => {
        networkManager.sendScore(appState.userId, newScore);
    };

    networkManager.onScoreUpdated = (userId, newScore) => {
    // 로컬 players Map 점수 갱신
    if (networkManager.players.has(userId)) {
        networkManager.players.get(userId).score = newScore;
    }
    // 실시간 순위판 렌더링
    const sorted = Array.from(networkManager.players.values())
        .sort((a, b) => b.score - a.score);
    ui.liveRanking.innerHTML = sorted
        .map((p, i) => `<li>${i + 1}. ${p.nickname || '(없음)'} — ${p.score}점</li>`)
        .join('');
};

    // --- UI 클릭 이벤트 ---
    document.getElementById('btn-enter-lobby').addEventListener('click', () => {
        if (!appState.nickname) appState.nickname = 'Guest_' + Math.floor(Math.random() * 1000);
        ui.myNicknameDisplay.innerText = `내 닉네임: ${appState.nickname}`;
        switchView('lobby');
    });

    document.getElementById('btn-create-room').addEventListener('click', async () => {
        const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const success = await networkManager.createRoomDB(newCode, appState.userId);
        
        if (success) {
            appState.isHost = true;
            appState.roomId = newCode; 
            appState.isReady = true; // 방장은 기본적으로 준비 완료 상태 취급
            networkManager.joinRoom(appState.roomId, appState.userId, getMyPresenceState());
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
            networkManager.joinRoom(appState.roomId, appState.userId, getMyPresenceState());
            toggleRoomDetail(true);
        } else {
            alert("존재하지 않거나 게임이 시작된 방입니다.");
        }
    });

    // [버그 수정] 닉네임 변경 반영
    ui.btnUpdateNickname.addEventListener('click', () => {
        const newName = ui.inRoomNickname.value.trim();
        if (newName) {
            appState.nickname = newName;
            ui.myNicknameDisplay.innerText = `내 닉네임: ${appState.nickname}`;
            ui.inRoomNickname.value = ''; 
            ui.inRoomNickname.placeholder = `현재 닉네임: ${newName}`;
            
            // 변경된 전체 상태(객체)를 서버로 전송
            networkManager.updatePresenceState(getMyPresenceState());
        }
    });

    // [버그 수정] 준비 상태 반영
    ui.btnReady.addEventListener('click', () => {
        appState.isReady = !appState.isReady;
        ui.btnReady.innerText = appState.isReady ? '준비 취소' : '준비 완료';
        ui.btnReady.style.backgroundColor = appState.isReady ? 'var(--danger)' : 'var(--primary)';
        
        networkManager.updatePresenceState(getMyPresenceState());
    });

    document.getElementById('btn-leave-room').addEventListener('click', () => {
        appState.isHost = false;
        appState.roomId = null;
        appState.isReady = false; 
        ui.btnReady.innerText = '준비 완료';
        ui.btnReady.style.backgroundColor = 'var(--primary)';
        
        networkManager.leaveRoom();
        toggleRoomDetail(false);
    });

    // [버그 수정] 준비 완료 검증 및 방장 화면 전환 흐름
    ui.btnStartGame.addEventListener('click', () => {
        const playersArray = Array.from(networkManager.players.values());
        const members = playersArray.filter(p => !p.isHost); // 방장 제외 멤버
        
        // [검증 흐름] 혼자 있거나, 멤버 중 준비 안 된 사람이 있으면 차단
        if (members.length === 0) {
            alert("최소 1명 이상의 멤버가 들어와야 게임을 시작할 수 있습니다!");
            return;
        }
        if (!members.every(p => p.isReady)) {
            alert("모든 멤버가 준비를 완료해야 시작할 수 있습니다!");
            return;
        }

        const seed = Math.random(); 
        
        // [실행 흐름] 순서 주의!
        networkManager.sendGameStart(seed); // 1. 멤버들에게 시작 신호 쏘기
        networkManager.onGameStarted(seed); // 2. 방장 본인도 즉시 게임 화면으로 강제 이동
        networkManager.updateRoomStatusPlaying(appState.roomId); // 3. DB 상태 변경 (난입 방지)
    });

    ui.btnReturnRoom.addEventListener('click', async () => {
        // 새 방 코드 생성 후 DB에 등록, 그 코드를 멤버에게 전달
        const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const success = await networkManager.createRoomDB(newCode, appState.userId);
        if (!success) { alert('방 생성에 실패했습니다.'); return; }

        appState.roomId = newCode;
        appState.isReady = true;
        networkManager.joinRoom(appState.roomId, appState.userId, getMyPresenceState());
        networkManager.sendRematchRequest(newCode);  // 실제 방 코드 전달
        switchView('lobby');
        toggleRoomDetail(true);
    });

    document.getElementById('btn-exit-game').addEventListener('click', () => {
        networkManager.leaveRoom();
        appState.isHost = false;
        switchView('start');
        toggleRoomDetail(false);
    });

    document.getElementById('btn-popup-return').addEventListener('click', () => {
        ui.rematchPopup.classList.add('hidden');
        switchView('lobby');
        toggleRoomDetail(true);
    });

    document.getElementById('btn-popup-exit').addEventListener('click', () => {
        ui.rematchPopup.classList.add('hidden');
        networkManager.leaveRoom();
        switchView('start');
        toggleRoomDetail(false);
    });
}

window.onload = () => {
    if (typeof networkManager !== 'undefined') {
        networkManager.init(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    }
    initEvents();
};