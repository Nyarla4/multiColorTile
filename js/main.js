/**
 * js/main.js
 * 역할: [흐름] 애플리케이션 진입점, 화면 전환 관리, 각 모듈(network, game) 연결.
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
    isReady: false // 추가: 준비 상태 추적
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
    // 로비 영역 (구조 변경됨: 목록 -> 액션 영역)
    roomActionArea: document.getElementById('room-action-area'),
    roomDetailArea: document.getElementById('room-detail-area'),
    roomCodeInput: document.getElementById('room-code-input'),
    displayRoomCode: document.getElementById('display-room-code'),
    btnJoinRoom: document.getElementById('btn-join-room'),
    
    // 게임 및 결과 영역
    btnStartGame: document.getElementById('btn-start-game'),
    btnReady: document.getElementById('btn-ready'),
    btnReturnRoom: document.getElementById('btn-return-room'),
    rematchPopup: document.getElementById('rematch-popup'),

    playerList: document.getElementById('player-list'), // 추가
    inRoomNickname: document.getElementById('in-room-nickname'), // 추가
    btnUpdateNickname: document.getElementById('btn-update-nickname'), // 추가
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
        
        // [구조] 화면에 현재 방 코드 렌더링
        if (ui.displayRoomCode) {
            ui.displayRoomCode.innerText = appState.roomId;
        }
        
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
        // [구조 초기화] 대기실로 나갈 때 입력창 비우기
        if (ui.roomCodeInput) ui.roomCodeInput.value = '';
    }
}

// ==========================================
// [흐름] 이벤트 바인딩 및 통신 연동
// ==========================================
function initEvents() {
    
    // --- 통신 모듈 수신 콜백 연결 ---
    networkManager.onGameStarted = (seed) => {
        switchView('game');
        gameInstance.initGame(seed);
        // 테스트용: 3초 후 결과창 이동
        setTimeout(() => {
            switchView('result');
            ui.btnReturnRoom.disabled = !appState.isHost;
        }, 3000); 
    };

    networkManager.onRematchRequested = (newRoomId) => {
        if (!appState.isHost && views.result.classList.contains('active')) {
            ui.rematchPopup.classList.remove('hidden');
        }
    };

    // --- 게임 모듈 콜백 연결 ---
    gameInstance.onScoreChanged = (newScore) => {
        networkManager.sendScore(appState.userId, newScore);
    };

    // --- UI 클릭 이벤트: 시작 및 입장 ---
    document.getElementById('btn-enter-lobby').addEventListener('click', () => {
        if (!appState.nickname) {
            appState.nickname = 'Guest_' + Math.floor(Math.random() * 1000);
        }
        switchView('lobby');

        // --- [흐름 추가] B. 방 내부 닉네임 변경 적용 ---
        ui.btnUpdateNickname.addEventListener('click', () => {
            const newName = ui.inRoomNickname.value.trim();
            if (newName) {
                appState.nickname = newName;
                // 변경된 닉네임을 서버(Presence)에 재전송
                networkManager.updatePresenceState(appState.userId, appState.nickname, appState.isReady);
                ui.inRoomNickname.value = ''; // 입력창 비우기
                ui.inRoomNickname.placeholder = `현재 닉네임: ${newName}`;
            }
        });

        // --- [흐름 추가] C. 준비 완료 상태 토글 적용 ---
        ui.btnReady.addEventListener('click', () => {
            appState.isReady = !appState.isReady;
            ui.btnReady.innerText = appState.isReady ? '준비 취소' : '준비 완료';
            ui.btnReady.style.backgroundColor = appState.isReady ? 'var(--danger)' : 'var(--primary)';
            // 준비 상태가 변했으므로 서버(Presence)에 재전송
            networkManager.updatePresenceState(appState.userId, appState.nickname, appState.isReady);
        });

        // --- [흐름 추가] D. 접속자 목록 실시간 렌더링 ---
        networkManager.onPlayerListUpdated = (players) => {
            ui.playerList.innerHTML = ''; // 기존 목록 초기화

            players.forEach(p => {
                const li = document.createElement('li');
                const isMe = p.userId === appState.userId;

                // 상태 텍스트 분기
                let statusText = p.isReady ? '준비완료' : '대기중';
                let statusColor = p.isReady ? 'var(--accent)' : 'var(--text-muted)';

                li.innerHTML = `
                <span style="font-weight: bold; color: ${isMe ? 'var(--primary)' : 'inherit'}">
                    ${p.nickname} ${isMe ? '(나)' : ''}
                </span>
                <span style="color: ${statusColor}; font-size: 0.9em;">
                    ${statusText}
                </span>
            `;
                ui.playerList.appendChild(li);
            });
        };
    });

    // --- [흐름 변경] A. 방 만들기 (방장 전용) ---
    document.getElementById('btn-create-room').addEventListener('click', async () => {
        // 1. 랜덤 6자리 코드 생성 (영문 대문자+숫자)
        const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        // 2. DB에 방 데이터 삽입 대기
        const success = await networkManager.createRoomDB(newCode, appState.userId);
        
        if (success) {
            appState.isHost = true;
            appState.roomId = newCode;
            networkManager.joinRoom(appState.roomId, appState.nickname, appState.userId);
            toggleRoomDetail(true);
        } else {
            alert("방 생성에 실패했습니다. 다시 시도해주세요.");
        }
    });

    // --- [흐름 추가] B. 코드로 입장하기 (일반 멤버) ---
    ui.btnJoinRoom.addEventListener('click', async () => {
        const code = ui.roomCodeInput.value.trim().toUpperCase();
        if (code.length !== 6) {
            alert("6자리 방 코드를 입력해주세요.");
            return;
        }

        // 1. DB에서 코드 유효성 및 상태(waiting) 검증 대기
        const isValid = await networkManager.checkRoomDB(code);
        
        if (isValid) {
            appState.isHost = false;
            appState.roomId = code;
            networkManager.joinRoom(appState.roomId, appState.nickname, appState.userId);
            toggleRoomDetail(true);
        } else {
            alert("존재하지 않거나 이미 게임이 시작된 방입니다.");
        }
    });

    // --- 기타 진행 및 종료 흐름 ---
    document.getElementById('btn-leave-room').addEventListener('click', () => {
        appState.isHost = false;
        appState.roomId = null;
        networkManager.leaveRoom();
        toggleRoomDetail(false);
    });

    ui.btnStartGame.addEventListener('click', () => {
        const seed = Math.random(); 
        networkManager.sendGameStart(seed);
        // [흐름 추가] 게임 시작 시 DB의 방 상태를 'playing'으로 변경
        networkManager.updateRoomStatusPlaying(appState.roomId);
    });

    ui.btnReturnRoom.addEventListener('click', () => {
        networkManager.sendRematchRequest('NEW_ROOM_ID'); 
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

// ==========================================
// [흐름] 앱 진입점
// ==========================================
window.onload = () => {
    if (typeof networkManager !== 'undefined') {
        networkManager.init(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    }
    initEvents();
    console.log("메인 흐름 제어기 및 실시간 통신망 초기화 완료.");
};