// [구조] 게임 상수 및 설정
export const GameConfig = {
    cols: 23,
    rows: 15,
    totalTiles: 200,
    timeLimit: 120,
    colors: ['#FF5733', '#33FF57', '#3357FF', '#FF33A8', '#33FFF0', '#F0FF33', '#8A2BE2']
};

// [구조] 보드 로직 (직선 탐색 포함)
export class Board {
    constructor(config) {
        this.cols = config.cols;
        this.rows = config.rows;
        this.grid = [];
    }

    // [흐름] 시드(초기 배열)를 주입받아 보드 세팅
    initializeWithSeed(seedArray) {
        this.grid = [...seedArray];
    }

    // [흐름] 십자 직선 탐색 (Raycast)
    getMatchedTilesToDestroy(index) {
        if (this.grid[index] !== null) return []; 

        const x = index % this.cols;
        const y = Math.floor(index / this.cols);
        const hitTiles = []; 

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

        const colorMap = {};
        hitTiles.forEach(idx => {
            const color = this.grid[idx];
            if (!colorMap[color]) colorMap[color] = [];
            colorMap[color].push(idx);
        });

        let toDestroy = [];
        for (const color in colorMap) {
            if (colorMap[color].length >= 2) {
                toDestroy = toDestroy.concat(colorMap[color]);
            }
        }
        return toDestroy;
    }
}