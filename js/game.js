// [구조] 게임 상수 및 설정
export const GameConfig = {
    cols:       23,
    rows:       15,
    totalTiles: 200,
    timeLimit:  120,

    activePaletteId: 'default', // 각자의 로컬 환경에서 선택된 테마

    palettes: {
        default: {
            name: '기본',
            colors: [
                '#FDA41B',
                '#FD6E6E',
                '#CCCE6E',
                '#FD8FFF',
                '#1BD21D',
                '#1B77FF',
                '#7CD4D4',
                '#924494',
                '#BEC0C0',
                '#D48535',
            ],
            emojis: [
                '★', // 별
                '■', // 네모
                '▲', // 위 세모
                '▬', // 가로줄 (일반 - 보다 두꺼운 텍스트 블록)
                '●', // 동그라미
                '◓', // 반원/돔 (상단 반원 기호)
                '▮', // 세로줄 (수직 텍스트 블록)
                '▼', // 아래 세모
                '＝', // 등호 (일반 = 보다 넓은 전각 문자 사용)
                '◆'  // 마름모
            ]
        },
        reactkr: {
            name: '리액트KR',
            colors: [
                '#c22628', // 시아 레드
                '#86c5ff', // 우루 블루: e2f0fd에서 게임적 허용으로 진해졌음...
                '#7e7291', // 쿠로카 퍼플
                '#168f43', // 마요 그린
                '#f6d3ff', // 키라 핑크
                '#7f97ac', // 라떼 블루
                '#fff3b2', // 나오 옐로
                '#f27127', // 무무 오렌지
                '#fcfafe', // 임시 텐텐 화이트
                '#1a1717', // 임시 텐텐 블랙
            ],
            emojis: [
                '🍎',
                '☁️',
                '🔮',
                '🍀',
                '💖',
                '🐯',
                '🎫',
                '🧡',
                '❄️', // 임시 텐텐 화이트
                '🍙', // 임시 텐텐 블랙
            ],
        }
    }
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


// [흐름] 초기 시드 배열 생성 — 색상을 최대한 균등하게 분배 후 무작위 배치
export function generateSeed(config) {
    const totalCells = config.cols * config.rows;
    const seed       = Array(totalCells).fill(null);
    const tileIndices = []; // 🚀 색상 대신 0, 1, 2... 숫자를 담을 배열

    const totalPairs = config.totalTiles / 2;
    // 모든 테마가 같은 개수의 색상을 가진다고 가정 (현재 8개)
    const colorCount = config.palettes.default.colors.length; 

    const basePairsPerColor = Math.floor(totalPairs / colorCount);
    const remainingPairs    = totalPairs % colorCount;

    // 🚀 [핵심] 색상 코드가 아니라 0 ~ 7 까지의 숫자(int)를 넣습니다.
    for (let c = 0; c < colorCount; c++) {
        for (let i = 0; i < basePairsPerColor; i++) {
            tileIndices.push(c, c); 
        }
    }
    for (let i = 0; i < remainingPairs; i++) {
        const c = Math.floor(Math.random() * colorCount);
        tileIndices.push(c, c);
    }

    // 인덱스 셔플 및 배치 (기존 로직 동일)
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
        seed[selectedIndices[i]] = tileIndices[i]; // seed 배열에는 이제 0~7 숫자가 들어갑니다.
    }

    return seed;
}


// [구조] 타이머 및 점수 관리
export class ScoreTimer {
    constructor(config) {
        this.timeLimit  = config.timeLimit; // 원래 제한 시간(120초) 보관
        this.time       = config.timeLimit;
        this.score      = 0;
        this.intervalId = null;
        this.endTime    = 0; // 🚀 현실 시간 기준의 종료 시각을 저장할 변수
    }

    start(callback) {
        // 🚀 타이머가 시작된 '현실 시간 + 120초'를 목표 종료 시각으로 절대 못 박음
        this.endTime = Date.now() + (this.timeLimit * 1000);

        // UI 갱신을 위해 1초(1000ms)마다 콜백 실행
        // (실행 주기가 밀려도 남은 시간 계산은 Date.now()로 하므로 절대 안 밀림!)
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

    // 🚀 단순히 -1을 하는 게 아니라, (목표 시각 - 현재 시각)을 계산
    _updateTime() {
        const now = Date.now();
        // 남은 밀리초를 초로 변환하고 올림 처리 (0 이하로 안 떨어지게 Math.max 적용)
        const remaining = Math.ceil((this.endTime - now) / 1000);
        this.time = Math.max(0, remaining);
    }

    // 🚀 main.js가 매 초마다 호출하는 메서드
    tick() { 
        this._updateTime(); // 틱이 불릴 때마다 현실 시간 기준으로 시간 갱신
        return this.time; 
    }

    isTimeUp() { 
        return this.time <= 0; 
    }
}