// [구조] 게임 상수 및 설정
export const GameConfig = {
    cols:       23,
    rows:       15,
    totalTiles: 200,
    timeLimit:  120,

    activePaletteId: 'default',

    palettes: {
        default: {
            name: '기본',
            colors: [
                '#FDA41B', '#FD6E6E', '#CCCE6E', '#FD8FFF',
                '#1BD21D', '#1B77FF', '#7CD4D4', '#924494',
                '#757575', '#8B4513',
            ],
            emojis: ['★', '■', '▲', '▬', '●', '◓', '▮', '▼', '＝', '◆'],
        },
        reactkr: {
            name: '리액트KR',
            colors: [
                '#c22628', // 시아 레드
                '#86c5ff', // 우루 블루: e2f0fd에서 게임적 허용으로 진해졌음
                '#8a72b1', // 쿠로카 퍼플: 7e7291에서 게임적 허용으로 더 보라됐음
                '#168f43', // 마요 그린
                '#e684ff', // 키라 핑크: f6d3ff에서 게임적 허용으로 더 분홍됨
                '#5c6b77', // 라떼 블루: 7f97ac에서 게임적 허용으로 어두워졌음
                '#fff3b2', // 나오 옐로
                '#f27127', // 무무 오렌지
                '#fcfafe', // 임시 텐텐 화이트
                '#1a1717', // 임시 텐텐 블랙
            ],
            emojis: ['🍎', '☁️', '🔮', '🍀', '💖', '🐯', '🎫', '🧡', '❄️', '🍙'],
        },
        // aiders: {
        //     name: '해결사들',
        //     colors: [
        //         '#AF0D4E', // 시우 레드
        //         '#FF59A9', // 시우 핑크
        //         '#B3C8F6', // 우현 스카이
        //         '#4260FF', // 우현 블루
        //         '#FFAC00', // 하준 오렌지
        //         '#BFB8E8', // 유진 바이올렛
        //         '#9489D5', // 유진 퍼플
        //         '#7CD4D4',
        //         '#757575',
        //         '#8B4513',
        //     ],
        //     emojis: ['✨', '☠', '🥽', '📢', '🦊', '🎭', '🍳', '💯', '💯', '💯'],
        // },
    },

    // [흐름] 현재 활성 팔레트 반환 헬퍼
    getActivePalette() {
        return this.palettes[this.activePaletteId];
    },

    // [흐름] 팔레트의 색상 수 반환 — generateSeed가 활성 팔레트 기준으로 동작하도록
    getColorCount() {
        return this.getActivePalette().colors.length;
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


// [흐름] 초기 시드 배열 생성 — 색상을 균등하게 분배 후 무작위 배치
// grid 값: 0 ~ (colorCount-1) 의 숫자 index, 빈 칸은 null
export function generateSeed(config) {
    const totalCells  = config.cols * config.rows;
    const seed        = Array(totalCells).fill(null);
    const tileIndices = [];

    const totalPairs  = config.totalTiles / 2;
    const colorCount  = config.getColorCount(); // 활성 팔레트 기준으로 색상 수 계산

    const basePairsPerColor = Math.floor(totalPairs / colorCount);
    const remainingPairs    = totalPairs % colorCount;

    for (let c = 0; c < colorCount; c++) {
        for (let i = 0; i < basePairsPerColor; i++) {
            tileIndices.push(c, c);
        }
    }
    for (let i = 0; i < remainingPairs; i++) {
        const c = Math.floor(Math.random() * colorCount);
        tileIndices.push(c, c);
    }

    const allIndices = Array.from({ length: totalCells }, (_, i) => i);
    for (let i = allIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allIndices[i], allIndices[j]] = [allIndices[j], allIndices[i]];
    }

    const selectedIndices = allIndices.slice(0, config.totalTiles);
    for (let i = tileIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tileIndices[i], tileIndices[j]] = [tileIndices[j], tileIndices[i]];
    }

    for (let i = 0; i < config.totalTiles; i++) {
        seed[selectedIndices[i]] = tileIndices[i];
    }

    return seed;
}


// [구조] 타이머 및 점수 관리
export class ScoreTimer {
    constructor(config) {
        this.timeLimit  = config.timeLimit;
        this.time       = config.timeLimit;
        this.score      = 0;
        this.intervalId = null;
        this.endTime    = 0;
    }

    start(callback) {
        // 현실 시간 기준 종료 시각을 절대값으로 고정 — setInterval 지연 누적 방지
        this.endTime = Date.now() + (this.timeLimit * 1000);
        this.intervalId = setInterval(() => {
            this._updateTime();
            callback();
        }, 1000);
    }

    stop() {
        clearInterval(this.intervalId);
        this.intervalId = null;
    }

    resetTimer() {
        this.endTime = Date.now() + (this.timeLimit * 1000);
        this._updateTime();
    }

    addScore(amount) { this.score += amount; }

    tick() {
        this._updateTime();
        return this.time;
    }

    isTimeUp() { return this.time <= 0; }

    _updateTime() {
        const remaining = Math.ceil((this.endTime - Date.now()) / 1000);
        this.time = Math.max(0, remaining);
    }
}