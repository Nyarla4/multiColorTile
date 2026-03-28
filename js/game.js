/**
 * js/game.js
 * 역할: [구조] 게임 규칙 데이터 보관 및 [흐름] 캔버스 렌더링.
 * 원칙: 네트워크 통신이나 UI 전환 로직이 섞이지 않음.
 */

const GAME_CONFIG = {
    ROWS: 12,
    COLS: 16,
    TILE_SIZE: 40,
    GAP: 4,
    COLORS: ['#ff4757', '#1e90ff', '#2ed573', '#ffa502', '#9c88ff', '#ff61a6']
};

// [구조] 상태 데이터
class GameState {
    constructor() {
        this.grid = [];
        this.score = 0;
        this.timeLeft = 120;
        this.isPlaying = false;
    }
}

// [흐름] 연산 및 렌더링
class GameManager {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.state = new GameState();
        this.isHost = false; // main.js에서 게임 시작 시 주입

        this.canvas.width = GAME_CONFIG.COLS * (GAME_CONFIG.TILE_SIZE + GAME_CONFIG.GAP) + GAME_CONFIG.GAP;
        this.canvas.height = GAME_CONFIG.ROWS * (GAME_CONFIG.TILE_SIZE + GAME_CONFIG.GAP) + GAME_CONFIG.GAP;

        this.canvas.addEventListener('mousedown', (e) => this.handleCanvasClick(e));

        // 외부에서 주입할 콜백
        this.onScoreChanged = (newScore) => {};
        this.onGameEnded = (finalScores) => {};
    }

    initGame(seed) {
        this.state.score = 0;
        this.state.timeLeft = 120;
        this.state.isPlaying = true;

        if (this.timerInterval) clearInterval(this.timerInterval);

        // seed 기반 결정론적 PRNG (xorshift32)
        // 모든 클라이언트가 동일한 seed를 받으면 완전히 동일한 그리드 생성
        let s = Math.floor(seed * 4294967296) >>> 0;
        if (s === 0) s = 1;
        const rand = () => {
            s ^= s << 13;
            s ^= s >>> 17;
            s ^= s << 5;
            return (s >>> 0) / 4294967296;
        };

        this.state.grid = Array(GAME_CONFIG.ROWS).fill(null).map(() =>
            Array(GAME_CONFIG.COLS).fill(null).map(() => {
                if (rand() < 0.6) {
                    return GAME_CONFIG.COLORS[Math.floor(rand() * GAME_CONFIG.COLORS.length)];
                }
                return null;
            })
        );
        this.render();

        const timeEl = document.getElementById('time-left');

        this.timerInterval = setInterval(() => {
            this.state.timeLeft--;
            if (timeEl) timeEl.textContent = this.state.timeLeft;

            if (this.state.timeLeft <= 0) {
                clearInterval(this.timerInterval);
                this.state.isPlaying = false;

                if (this.isHost) {
                    // 방장만 게임 종료 처리
                    // 1. 내 최종 점수 강제 전송 (throttle 무시)
                    networkManager.sendScore(appState.userId, this.state.score, true);
                    // 2. 최종 점수 목록을 모든 멤버에게 브로드캐스트
                    const finalScores = Array.from(networkManager.players.values());
                    networkManager.sendGameEnd(finalScores);
                    // 3. 방장 본인 결과 화면 전환
                    if (this.onGameEnded) this.onGameEnded(finalScores);
                }
                // 멤버는 game_end 브로드캐스트 수신 시 main.js의 onGameEndedBroadcast에서 처리
            }
        }, 1000);
    }

    // 강제 종료: 방장의 game_end 브로드캐스트 수신 시 멤버 측에서 호출
    forceEnd(finalScores) {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.state.isPlaying = false;
        if (this.onGameEnded) this.onGameEnded(finalScores);
    }

    // 핵심 룰 검증
    handleCanvasClick(event) {
        if (!this.state.isPlaying) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const col = Math.floor(x / (GAME_CONFIG.TILE_SIZE + GAME_CONFIG.GAP));
        const row = Math.floor(y / (GAME_CONFIG.TILE_SIZE + GAME_CONFIG.GAP));

        if (row < 0 || row >= GAME_CONFIG.ROWS || col < 0 || col >= GAME_CONFIG.COLS) return;
        if (this.state.grid[row][col] !== null) return;

        let hitTiles = [];

        // 십자 탐색
        for (let r = row - 1; r >= 0; r--) { if (this.state.grid[r][col] !== null) { hitTiles.push({ r, c: col, color: this.state.grid[r][col] }); break; } }
        for (let r = row + 1; r < GAME_CONFIG.ROWS; r++) { if (this.state.grid[r][col] !== null) { hitTiles.push({ r, c: col, color: this.state.grid[r][col] }); break; } }
        for (let c = col - 1; c >= 0; c--) { if (this.state.grid[row][c] !== null) { hitTiles.push({ r: row, c, color: this.state.grid[row][c] }); break; } }
        for (let c = col + 1; c < GAME_CONFIG.COLS; c++) { if (this.state.grid[row][c] !== null) { hitTiles.push({ r: row, c, color: this.state.grid[row][c] }); break; } }

        let colorCounts = {};
        hitTiles.forEach(t => { colorCounts[t.color] = (colorCounts[t.color] || 0) + 1; });

        let tilesToRemove = hitTiles.filter(t => colorCounts[t.color] >= 2);

        if (tilesToRemove.length > 0) {
            tilesToRemove.forEach(t => { this.state.grid[t.r][t.c] = null; });

            // 중력: 파괴된 열의 타일을 아래로 내림
            const affectedCols = [...new Set(tilesToRemove.map(t => t.c))];
            affectedCols.forEach(c => {
                // 해당 열에서 타일만 아래에서 위 순서로 수집
                const tiles = [];
                for (let r = GAME_CONFIG.ROWS - 1; r >= 0; r--) {
                    if (this.state.grid[r][c] !== null) tiles.push(this.state.grid[r][c]);
                }
                // 아래부터 채우고 나머지는 null
                for (let r = GAME_CONFIG.ROWS - 1; r >= 0; r--) {
                    this.state.grid[r][c] = tiles.length > 0 ? tiles.shift() : null;
                }
            });

            let points = tilesToRemove.length * 10;
            if (tilesToRemove.length >= 3) points += 20;

            this.state.score += points;
            this.render();

            this.onScoreChanged(this.state.score);
        }
    }

    render() {
        this.ctx.fillStyle = '#0f3460';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        for (let r = 0; r < GAME_CONFIG.ROWS; r++) {
            for (let c = 0; c < GAME_CONFIG.COLS; c++) {
                const color = this.state.grid[r][c];
                if (color) {
                    const x = GAME_CONFIG.GAP + c * (GAME_CONFIG.TILE_SIZE + GAME_CONFIG.GAP);
                    const y = GAME_CONFIG.GAP + r * (GAME_CONFIG.TILE_SIZE + GAME_CONFIG.GAP);

                    this.ctx.fillStyle = color;
                    this.ctx.beginPath();
                    this.ctx.roundRect(x, y, GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE, 6);
                    this.ctx.fill();

                    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                    this.ctx.beginPath();
                    this.ctx.roundRect(x, y, GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE / 2, 6);
                    this.ctx.fill();
                }
            }
        }
    }
}

const gameInstance = new GameManager('game-canvas');
