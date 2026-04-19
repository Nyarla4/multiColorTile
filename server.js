// server.js
const { Server } = require("socket.io");
const http = require("http");

// 1. HTTP 서버 생성 (Render 등 클라우드 배포 환경에서 필수)
// 🚀 [수정] 브라우저로 접속하면 화면에 글자를 띄워주도록 응답 추가
const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('소켓 서버가 정상적으로 켜져 있습니다! 🚀');
    }
});

// 2. CORS 설정: 허용할 도메인 목록
const ALLOWED_ORIGINS = [
    "http://localhost:5173",       // 로컬 테스트 (Vite 기본 포트)
    "http://127.0.0.1:5173",
    "https://multi-color-tile.vercel.app" // 🚀 Vercel에 배포된 실제 프론트엔드 주소로 변경하세요!
];

const io = new Server(server, {
    cors: {
        origin: ALLOWED_ORIGINS,
        methods: ["GET", "POST"]
    }
});

// ============================================================================
// [구조] 서버 메모리 기반 방·상태 관리
// ============================================================================
// 더 이상 느린 DB(PostgreSQL)를 쓰지 않고, 가장 빠른 서버 RAM 메모리에 방을 기록합니다.
const rooms = {};


// ============================================================================
// [흐름] 클라이언트 통신망 제어
// ============================================================================
io.on("connection", (socket) => {
    console.log(`[Server] 클라이언트 접속: ${socket.id}`);

    // 1. 방 접속 및 상태망(Presence) 동기화
    socket.on("join_room", ({ roomCode, playerData }, callback) => {
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.playerId = playerData.id;

        // 방 구조가 없으면 생성하고, 유저 데이터를 넣음
        if (!rooms[roomCode]) rooms[roomCode] = {};
        rooms[roomCode][playerData.id] = playerData;

        // 방에 있는 모두에게 현재 갱신된 접속자 목록 쏘기
        io.to(roomCode).emit("sync_state", Object.values(rooms[roomCode]));
        callback({ success: true });
    });

    // 2. 내 상태 업데이트 (🚀 클로드 지적 반영: 방어 코드 추가)
    socket.on("update_state", (playerData) => {
        const roomCode = socket.roomCode;
        // playerData와 playerData.id가 확실히 존재할 때만 갱신 (서버 크래시 방지)
        if (roomCode && rooms[roomCode] && playerData?.id) {
            rooms[roomCode][playerData.id] = playerData;
            io.to(roomCode).emit("sync_state", Object.values(rooms[roomCode]));
        }
    });

    // 3. 무전기(Broadcast) (🚀 클로드 지적 반영: 방 번호 누락 방지)
    socket.on("broadcast", ({ event, payload }) => {
        // 소켓이 아직 방에 제대로 속하지 않은 상태에서 쏘는 유령 통신 차단
        if (!socket.roomCode) return; 
        socket.to(socket.roomCode).emit(event, payload);
    });

    // 4. 빠른 입장 (DB 쿼리 대체)
    socket.on("get_random_room", (callback) => {
        // 사람이 1명이라도 있는 활성화된 방 목록 추출
        const activeRooms = Object.keys(rooms).filter(code => Object.keys(rooms[code]).length > 0);
        
        if (activeRooms.length === 0) {
            return callback({ roomCode: null });
        }
        
        const randomCode = activeRooms[Math.floor(Math.random() * activeRooms.length)];
        callback({ roomCode: randomCode });
    });

    // 5. 🚀 연결 끊김 (유령 방 완벽 청소기)
    socket.on("disconnect", () => {
        const roomCode = socket.roomCode;
        const playerId = socket.playerId;
        
        if (roomCode && rooms[roomCode] && rooms[roomCode][playerId]) {
            // 1. 살아남은 사람들에게 "이 사람 나갔음" 이라고 방송
            socket.to(roomCode).emit("player_left", { id: playerId });
            
            // 2. 구조(메모리)에서 해당 유저 삭제
            delete rooms[roomCode][playerId];
            
            // 3. 만약 방에 아무도 안 남았다면? 방 자체를 폭파! (유령방 소멸)
            if (Object.keys(rooms[roomCode]).length === 0) {
                delete rooms[roomCode];
                console.log(`[Server] ${roomCode} 방이 비어 완전히 삭제되었습니다.`);
            } else {
                io.to(roomCode).emit("sync_state", Object.values(rooms[roomCode]));
            }
        }
        console.log(`[Server] 클라이언트 퇴장: ${socket.id}`);
    });
});

// Render 배포 환경에서는 process.env.PORT가 자동으로 주입됩니다.
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Socket.io 멀티플레이 서버가 ${PORT} 포트에서 실행 중입니다.`);
});