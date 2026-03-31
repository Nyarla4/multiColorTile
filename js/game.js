export const GameConfig = {
    cols: 23, rows: 15, totalTiles: 200, timeLimit: 120,
    activePaletteId: 'default',
    palettes: {
        default: {
            name: '기본',
            colors: ['#FDA41B', '#FD6E6E', '#CCCE6E', '#FD8FFF', '#1BD21D', '#1B77FF', '#7CD4D4', '#924494', '#757575', '#8B4513'],
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
    },
    getActivePalette() { return this.palettes[this.activePaletteId]; },
    getColorCount() { return this.getActivePalette().colors.length; },
};

export class Board {
    constructor(config) {
        this.cols = config.cols;
        this.rows = config.rows;
        this.grid = [];
    }

    initializeWithSeed(seedArray) {
        this.grid = [...seedArray];
    }

    getMatchedTilesToDestroy(index) {
        if (this.grid[index] !== null) return [];

        const x = index % this.cols;
        const y = Math.floor(index / this.cols);
        const hitTiles = [];
        
        // 4방향 탐색 통합 리팩토링
        const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // 상, 하, 좌, 우
        
        for (const [dx, dy] of directions) {
            let cx = x + dx;
            let cy = y + dy;
            
            while (cx >= 0 && cx < this.cols && cy >= 0 && cy < this.rows) {
                const idx = cy * this.cols + cx;
                if (this.grid[idx] !== null) {
                    hitTiles.push(idx);
                    break;
                }
                cx += dx;
                cy += dy;
            }
        }

        const colorMap = hitTiles.reduce((acc, idx) => {
            const color = this.grid[idx];
            acc[color] = acc[color] || [];
            acc[color].push(idx);
            return acc;
        }, {});

        return Object.values(colorMap).filter(arr => arr.length >= 2).flat();
    }
}

export function generateSeed(config) {
    const totalCells = config.cols * config.rows;
    const seed = Array(totalCells).fill(null);
    const tileIndices = [];

    const totalPairs = config.totalTiles / 2;
    const colorCount = config.getColorCount(); 

    const basePairsPerColor = Math.floor(totalPairs / colorCount);
    const remainingPairs = totalPairs % colorCount;

    for (let c = 0; c < colorCount; c++) {
        for (let i = 0; i < basePairsPerColor; i++) tileIndices.push(c, c);
    }
    for (let i = 0; i < remainingPairs; i++) {
        tileIndices.push(Math.floor(Math.random() * colorCount), Math.floor(Math.random() * colorCount));
    }

    const allIndices = Array.from({ length: totalCells }, (_, i) => i);
    
    // 피셔-예이츠 셔플 헬퍼 함수 도입
    const shuffle = (array) => {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    };

    shuffle(allIndices);
    shuffle(tileIndices);

    const selectedIndices = allIndices.slice(0, config.totalTiles);
    for (let i = 0; i < config.totalTiles; i++) {
        seed[selectedIndices[i]] = tileIndices[i];
    }

    return seed;
}

export class ScoreTimer {
    constructor(config) {
        this.timeLimit = config.timeLimit;
        this.time = config.timeLimit;
        this.score = 0;
        this.intervalId = null;
        this.endTime = 0;
    }

    start(callback) {
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

    addScore(amount) { this.score += amount; }
    tick() { this._updateTime(); return this.time; }
    isTimeUp() { return this.time <= 0; }
    
    _updateTime() {
        this.time = Math.max(0, Math.ceil((this.endTime - Date.now()) / 1000));
    }
}