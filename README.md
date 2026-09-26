# 城市末端配送模拟 · 时效结算台

- 行业：物流
- 技术栈：Vue3、Vite、TypeScript、Element Plus、Leaflet
- 启动：`npm install && npm run dev`
- 构建：`npm run build`

订单点页面已升级为时效结算台：每单记录订单金额、承诺/实际送达与延迟原因，按规则试算迟到扣款。

- 规则层 `src/domain/settlement.ts`：普通单每迟到 5 分钟扣 2%（封顶 10 元）；冷链单迟到超 30 分钟后每 5 分钟扣 4%（封顶 50 元）。纯函数，调规则只改这里。
- 留档层 `src/stores/settlement.ts`：订单、版本化判定与操作留档，确认才扣款、申诉冻结、改判生成新版本且旧决定可查；数据持久化在 localStorage，重开可按订单号核对。
- 页面层 `src/App.vue`：录入、试算、判定/申诉/改判操作与留档查询。
