// [구조] 게임 상수 및 설정
export const GameConfig = {
    cols:       23,
    rows:       15,
    totalTiles: 200,
    timeLimit:  120,

    colors: [
        '#c22628', // 시아 레드
        '#e2f0fd', // 우루 블루
        '#7e7291', // 쿠로카 퍼플
        '#f6b655', // 마요 오렌지
        '#f6d3ff', // 키라 핑크
        '#7f97ac', // 라떼 블루
        '#f27127', // 무무 오렌지
    ],

    emojis: {
        '#c22628': '🍎',
        '#e2f0fd': '☁️',
        '#7e7291': '🔮',
        '#f6b655': '🍀',
        '#f6d3ff': '💖',
        '#7f97ac': '🐯',
        '#f27127': '🧡',
    },
};


// [구조] 보드 상태 및 십자 탐색 로직
export class Board {
    constructor(config) {
        this.cols = config.cols;
        this.rows = config.rows;
        this.grid = [];
    }

    // [흐름] 시드 배열로 보드 초기화
    initializeWithSeed(seedArray) {
        this.grid = [...seedArray];
    }

    // [흐름] 클릭한 빈 칸에서 십자 방향으로 타일 탐색 후 제거 대상 반환
    getMatchedTilesToDestroy(index) {
        if (this.grid[index] !== null) return [];

        const x = index % this.cols;
        const y = Math.floor(index / this.cols);
        const hitTiles = [];

        // 상·하·좌·우 각 방향에서 가장 가까운 타일 1개씩 수집
        for (let r = y - 1; r >= 0; r--) {
            const idx = r * this.cols + x;
            if (this.grid[idx] !== null) { hitTiles.push(idx); break; }
        }
        for (let r = y + 1; r < this.rows; r++) {
            const idx = r * this.cols + x;
            if (this.grid[idx] !== null) { hitTiles.push(idx); break; }
        }
        for (let c = x - 1; c >= 0; c--) {
            const idx = y * this.cols + c;
            if (this.grid[idx] !== null) { hitTiles.push(idx); break; }
        }
        for (let c = x + 1; c < this.cols; c++) {
            const idx = y * this.cols + c;
            if (this.grid[idx] !== null) { hitTiles.push(idx); break; }
        }

        // 같은 색이 2개 이상인 경우만 제거 대상으로 확정
        const colorMap = {};
        hitTiles.forEach(idx => {
            const color = this.grid[idx];
            if (!colorMap[color]) colorMap[color] = [];
            colorMap[color].push(idx);
        });

        let toDestroy = [];
        for (const color in colorMap) {
            if (colorMap[color].length >= 2) toDestroy = toDestroy.concat(colorMap[color]);
        }
        return toDestroy;
    }
}


// [흐름] 초기 시드 배열 생성 — 동일 색 쌍(200개)을 무작위 위치에 배치
export function generateSeed(config) {
    const totalCells = config.cols * config.rows;
    const seed       = Array(totalCells).fill(null);
    const tileColors = [];

    // 1. 색상 쌍 생성 (100쌍 = 200개)
    for (let i = 0; i < config.totalTiles / 2; i++) {
        const color = config.colors[Math.floor(Math.random() * config.colors.length)];
        tileColors.push(color, color);
    }

    // 2. 전체 인덱스 셔플
    const allIndices = Array.from({ length: totalCells }, (_, i) => i);
    for (let i = allIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allIndices[i], allIndices[j]] = [allIndices[j], allIndices[i]];
    }

    // 3. 색상 배열 셔플 후 선정된 위치에 배치
    const selectedIndices = allIndices.slice(0, config.totalTiles);
    for (let i = tileColors.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tileColors[i], tileColors[j]] = [tileColors[j], tileColors[i]];
    }
    for (let i = 0; i < config.totalTiles; i++) {
        seed[selectedIndices[i]] = tileColors[i];
    }

    return seed;
}


// [구조] 타이머 및 점수 관리
export class ScoreTimer {
    constructor(config) {
        this.time       = config.timeLimit;
        this.score      = 0;
        this.intervalId = null;
    }

    start(callback) { this.intervalId = setInterval(callback, 1000); }

    stop() {
        clearInterval(this.intervalId);
        this.intervalId = null;
    }

    addScore(amount) { this.score += amount; }
    tick()           { this.time--; return this.time; }
    isTimeUp()       { return this.time <= 0; }
}