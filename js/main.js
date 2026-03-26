/**
 * js/main.js
 * 역할: [흐름] 애플리케이션 진입점, 화면 전환 관리, 각 모듈 연결 및 상태 렌더링
 * 원칙: 특정 모듈의 구현체를 수정하거나, HTML 구조를 직접 조작(.hidden 토글 제외)하지 않음.
 */

// ==========================================
// [구조] 전역 구성 및 상태
// ==========================================
const CONFIG = {
    SUPABASE_URL: 'https://mhoscqcewmrorfxcewsn.supabase.co',
    SUPABASE_KEY: 'sb_publishable_2e33xf0hNMg3sP4xNTIiwQ_HGhFFu12'
};

const appState = {
    userId: 'USER_' + Math.random().toString(36).substr(2, 9),
    nickname: '',
    isHost: false,
    roomId: null,
    isReady: false // 준비 상태
};

// ==========================================
// [구조] 뷰 및 UI 컴포넌트 참조
// ==========================================
const views = {
    start: document.getElementById('start-view'),
    lobby: document.getElementById('lobby-view'),
    game: document.getElementById('game-view'),
    result: document.getElementById('result-view')
};

const ui = {
    // 로비 (방 생성/입장)
    roomActionArea: document.getElementById('room-action-area'),
    roomCodeInput: document.getElementById('room-code-input'),
    btnJoinRoom: document.getElementById('btn-join-room'),
    myNicknameDisplay: document.getElementById('my-nickname-display'),
    
    // 대기실 내부
    roomDetailArea: document.getElementById('room-detail-area'),
    displayRoomCode: document.getElementById('display-room-code'),
    playerList: document.getElementById('player-list'),
    inRoomNickname: document.getElementById('in-room-nickname'),
    btnUpdateNickname: document.getElementById('btn-update-nickname'),
    
    // 컨트롤 버튼
    btnStartGame: document.getElementById('btn-start-game'),
    btnReady: document.getElementById('btn-ready'),
    btnReturnRoom: document.getElementById('btn-return-room'),
    rematchPopup: document.getElementById('rematch-popup')
};

// ==========================================
// [흐름] 화면 전환 제어
// ==========================================
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

// ==========================================
// [흐름] 이벤트 바인딩 및 통신 연동
// ==========================================
function initEvents() {
    
    // --- 통신 모듈 수신 콜백 연결 ---
    networkManager.onPlayerListUpdated = (players) => {
        ui.playerList.innerHTML = ''; // 기존 구조 초기화
        
        players.forEach(p => {
            const li = document.createElement('li');
            const isMe = p.userId === appState.userId;
            
            let statusText = p.isReady ? '준비완료' : '대기중';
            let statusColor = p.isReady ? 'var(--accent)' : 'var(--text-muted)';
            if (p.userId === appState.roomId) statusText = '방장'; // 방장은 상태 예외 처리

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
    };

    networkManager.onRematchRequested = (newRoomId) => {
        if (!appState.isHost && views.result.classList.contains('active')) {
            ui.rematchPopup.classList.remove('hidden');
        }
    };

    gameInstance.onScoreChanged = (newScore) => {
        networkManager.sendScore(appState.userId, newScore);
    };

    // --- UI 클릭 이벤트 ---
    
    // 1. 첫 화면 로비 입장 (닉네임 자동 생성)
    document.getElementById('btn-enter-lobby').addEventListener('click', () => {
        if (!appState.nickname) {
            appState.nickname = 'Guest_' + Math.floor(Math.random() * 1000);
        }
        ui.myNicknameDisplay.innerText = `내 닉네임: ${appState.nickname}`;
        switchView('lobby');
    });

    // 2. 방 만들기
    document.getElementById('btn-create-room').addEventListener('click', async () => {
        const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const success = await networkManager.createRoomDB(newCode, appState.userId);
        
        if (success) {
            appState.isHost = true;
            appState.roomId = newCode; 
            networkManager.joinRoom(appState.roomId, appState.nickname, appState.userId);
            toggleRoomDetail(true);
        } else {
            alert("방 생성에 실패했습니다.");
        }
    });

    // 3. 코드로 입장
    ui.btnJoinRoom.addEventListener('click', async () => {
        const code = ui.roomCodeInput.value.trim().toUpperCase();
        if (code.length !== 6) { alert("6자리 방 코드를 입력해주세요."); return; }

        const isValid = await networkManager.checkRoomDB(code);
        if (isValid) {
            appState.isHost = false;
            appState.roomId = code;
            networkManager.joinRoom(appState.roomId, appState.nickname, appState.userId);
            toggleRoomDetail(true);
        } else {
            alert("존재하지 않거나 게임이 시작된 방입니다.");
        }
    });

    // 4. 대기실 내부: 닉네임 변경 적용
    ui.btnUpdateNickname.addEventListener('click', () => {
        const newName = ui.inRoomNickname.value.trim();
        if (newName) {
            appState.nickname = newName;
            ui.myNicknameDisplay.innerText = `내 닉네임: ${appState.nickname}`;
            ui.inRoomNickname.value = ''; 
            ui.inRoomNickname.placeholder = `현재 닉네임: ${newName}`;
            
            if(networkManager.updatePresenceState) {
                networkManager.updatePresenceState(appState.userId, appState.nickname, appState.isReady);
            }
        }
    });

    // 5. 대기실 내부: 준비 상태 토글
    ui.btnReady.addEventListener('click', () => {
        appState.isReady = !appState.isReady;
        ui.btnReady.innerText = appState.isReady ? '준비 취소' : '준비 완료';
        ui.btnReady.style.backgroundColor = appState.isReady ? 'var(--danger)' : 'var(--primary)';
        
        if(networkManager.updatePresenceState) {
            networkManager.updatePresenceState(appState.userId, appState.nickname, appState.isReady);
        }
    });

    // 6. 방 나가기 및 정리
    document.getElementById('btn-leave-room').addEventListener('click', () => {
        appState.isHost = false;
        appState.roomId = null;
        appState.isReady = false; 
        ui.btnReady.innerText = '준비 완료';
        ui.btnReady.style.backgroundColor = 'var(--primary)';
        
        networkManager.leaveRoom();
        toggleRoomDetail(false);
    });

    // 7. 게임 시작 (방장 전용)
    ui.btnStartGame.addEventListener('click', () => {
        const seed = Math.random(); 
        networkManager.sendGameStart(seed);
        networkManager.updateRoomStatusPlaying(appState.roomId);
    });

    // 8. 결과창: 방장 리매치 요청
    ui.btnReturnRoom.addEventListener('click', () => {
        networkManager.sendRematchRequest('NEW_ROOM_ID'); 
        switchView('lobby');
        toggleRoomDetail(true);
    });

    // 9. 결과창: 완전히 나가기
    document.getElementById('btn-exit-game').addEventListener('click', () => {
        networkManager.leaveRoom();
        appState.isHost = false;
        switchView('start');
        toggleRoomDetail(false);
    });

    // 10. 팝업: 멤버 리매치 수락
    document.getElementById('btn-popup-return').addEventListener('click', () => {
        ui.rematchPopup.classList.add('hidden');
        switchView('lobby');
        toggleRoomDetail(true);
    });

    // 11. 팝업: 멤버 리매치 거절
    document.getElementById('btn-popup-exit').addEventListener('click', () => {
        ui.rematchPopup.classList.add('hidden');
        networkManager.leaveRoom();
        switchView('start');
        toggleRoomDetail(false);
    });
}

// ==========================================
// [흐름] 앱 진입점
// ==========================================
window.onload = () => {
    if (typeof networkManager !== 'undefined') {
        networkManager.init(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    }
    initEvents();
    console.log("메인 흐름 제어기 초기화 완료.");
};