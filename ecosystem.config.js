// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "multicolortile",
      script: "./server.js",
      cwd: "/home/ubuntu/apps/multiColorTile",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production"
      },
      // 1GB 중 OS+nginx 몫을 빼고 안전 마진을 둔 재시작 임계치
      max_memory_restart: "450M",
      // V8 힙 자체도 미리 상한을 낮춰서, OOM killer한테 죽기 전에
      // Node가 스스로 GC 압박을 느끼도록 유도
      node_args: "--max-old-space-size=400"
    }
  ]
};