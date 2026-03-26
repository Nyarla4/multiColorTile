/**
 * js/main.js
 * 역할: [흐름] 애플리케이션 진입점, 화면 전환 관리, 각 모듈(network, game) 연결.
 * 원칙: 특정 모듈의 구현체를 수정하거나, HTML 구조를 직접 조작(.hidden 토글 제외)하지 않음.
 */

// [구조] 전역 구성
const CONFIG = {
    SUPABASE_URL: 'https://mhoscqcewmrorfxcewsn.supabase.co',
    SUPABASE_KEY: 'sb_publishable_2e33xf0hNMg3sP4xNTIiwQ_HGhFFu12'
};

const appState = {
    userId: 'USER_' + Math.random().toString(36).substr(2, 9),
    nickname: '',
    isHost: false,
    roomId: null
};

// [구조] 뷰 참조
const views = {
    start: document.getElementById('start-view'),
    lobby: document.getElementById('lobby-view'),
    game: document.getElementById('game-view'),
    result: document.getElementById('result-view')
};

const ui = {
    roomListArea: document.getElementById('room-list-area'),
    roomDetailArea: document.getElementById('room-detail-area'),
    btnStartGame: document.getElementById('btn-start-game'),
    btnReady: document.getElementById('btn-ready'),
    btnReturnRoom: document.getElementById('btn-return-room'),
    rematchPopup: document.getElementById('rematch-popup')
};

// [흐름] 화면 전환 (구조를 해치지 않고 클래스만 토글)
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
        ui.roomListArea.classList.add('hidden');
        ui.roomDetailArea.classList.remove('hidden');
        
        if (appState.isHost) {
            ui.btnStartGame.classList.remove('hidden');
            ui.btnReady.classList.add('hidden');
        } else {
            ui.btnStartGame.classList.add('hidden');
            ui.btnReady.classList.remove('hidden');
        }
    } else {
        ui.roomListArea.classList.remove('hidden');
        ui.roomDetailArea.classList.add('hidden');
    }
}

// [흐름] 이벤트 바인딩 및 모듈 결합
function initEvents() {
    
    // --- 통신 모듈 콜백 연결 ---
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

    // --- UI 이벤트 처리 ---
    document.getElementById('btn-enter-lobby').addEventListener('click', () => {
        const nickname = document.getElementById('nickname-input').value.trim();
        if (!nickname) { alert('닉네임을 입력해주세요!'); return; }
        
        appState.nickname = nickname;
        document.getElementById('my-nickname-display').innerText = `내 닉네임: ${nickname}`;
        switchView('lobby');
    });

    document.getElementById('btn-create-room').addEventListener('click', () => {
        appState.isHost = true;
        appState.roomId = 'ROOM_' + Math.random().toString(36).substr(2, 9);
        
        networkManager.joinRoom(appState.roomId, appState.nickname, appState.userId);
        toggleRoomDetail(true);
    });

    document.getElementById('btn-leave-room').addEventListener('click', () => {
        appState.isHost = false;
        appState.roomId = null;
        
        networkManager.leaveRoom();
        toggleRoomDetail(false);
    });

    ui.btnStartGame.addEventListener('click', () => {
        const seed = Math.random(); // 임시 시드
        networkManager.sendGameStart(seed);
    });

    ui.btnReturnRoom.addEventListener('click', () => {
        networkManager.sendRematchRequest('NEW_ROOM_ID'); // 방장 리매치
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

// [흐름] 진입점
window.onload = () => {
    if (typeof networkManager !== 'undefined') {
        networkManager.init(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    }
    initEvents();
    console.log("메인 흐름 제어기 및 실시간 통신망 초기화 완료.");
};