import type { Order, Ruling } from "../domain/types";

/**
 * 留档层：订单与判定版本的持久化。
 * 与规则层、页面层完全分离，重开页面后按订单号即可核对全部留档。
 */
const ARCHIVE_KEY = "hxwlfront-15-settlement-archive";

export interface SettlementArchive {
  orders: Order[];
  rulings: Ruling[];
}

export function loadArchive(): SettlementArchive {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SettlementArchive;
      if (Array.isArray(parsed.orders) && Array.isArray(parsed.rulings)) return parsed;
    }
  } catch {
    // 留档损坏时回退到种子数据，避免页面崩溃
  }
  return seedArchive();
}

export function saveArchive(archive: SettlementArchive): void {
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive));
}

/** 首次打开时的演示留档：覆盖准时、配送中、待定责、待确认、申诉冻结、已扣款、改判等情形 */
function seedArchive(): SettlementArchive {
  const orders: Order[] = [
    {
      id: "order-1",
      code: "SO092001",
      type: "normal",
      amount: 86,
      promisedAt: "2026-09-20T12:00",
      actualAt: "2026-09-20T12:14",
      delayReason: "骑手原因",
      rider: "骑手A",
      address: "世纪大道 100 号",
      createdAt: "2026-09-20T09:00:00.000Z",
    },
    {
      id: "order-2",
      code: "SO092102",
      type: "cold",
      amount: 320,
      promisedAt: "2026-09-21T18:00",
      actualAt: "2026-09-21T18:52",
      delayReason: "备货延误",
      rider: "骑手B",
      address: "陆家嘴环路 58 号",
      createdAt: "2026-09-21T15:00:00.000Z",
    },
    {
      id: "order-3",
      code: "SO092203",
      type: "cold",
      amount: 260,
      promisedAt: "2026-09-23T10:30",
      actualAt: "2026-09-23T11:20",
      delayReason: "备货延误",
      rider: "骑手A",
      address: "张江高科技园区",
      createdAt: "2026-09-23T08:00:00.000Z",
    },
    {
      id: "order-4",
      code: "SO092304",
      type: "normal",
      amount: 45,
      promisedAt: "2026-09-24T13:00",
      actualAt: "2026-09-24T13:09",
      delayReason: "骑手原因",
      rider: "骑手C",
      address: "金桥路 800 号",
      createdAt: "2026-09-24T10:00:00.000Z",
    },
    {
      id: "order-5",
      code: "SO092405",
      type: "normal",
      amount: 120,
      promisedAt: "2026-09-25T19:00",
      actualAt: "2026-09-25T19:03",
      delayReason: "骑手原因",
      rider: "骑手B",
      address: "外滩源 33 号",
      createdAt: "2026-09-25T16:00:00.000Z",
    },
    {
      id: "order-6",
      code: "SO092506",
      type: "cold",
      amount: 540,
      promisedAt: "2026-09-25T20:00",
      actualAt: "2026-09-25T20:25",
      delayReason: "交通管控",
      rider: "骑手C",
      address: "五角场万达广场",
      createdAt: "2026-09-25T17:00:00.000Z",
    },
    {
      id: "order-7",
      code: "SO092607",
      type: "normal",
      amount: 75,
      promisedAt: "2026-09-26T11:00",
      actualAt: "2026-09-26T10:52",
      delayReason: "骑手原因",
      rider: "骑手A",
      address: "徐家汇路 618 号",
      createdAt: "2026-09-26T08:30:00.000Z",
    },
    {
      id: "order-8",
      code: "SO092608",
      type: "normal",
      amount: 200,
      promisedAt: "2026-09-26T15:00",
      actualAt: null,
      delayReason: "骑手原因",
      rider: "骑手B",
      address: "花木路 1200 号",
      createdAt: "2026-09-26T12:00:00.000Z",
    },
  ];

  const rulings: Ruling[] = [
    {
      id: "ruling-1",
      orderId: "order-1",
      version: 1,
      liableParty: "rider",
      reason: "骑手取餐后绕路，客户确认迟到",
      delayMinutes: 14,
      penalty: 5.16,
      ruleLabel: "普通单：每迟到5分钟扣订单金额2%，单笔封顶10元",
      status: "confirmed",
      createdAt: "2026-09-20T13:00:00.000Z",
      resolvedAt: "2026-09-20T15:00:00.000Z",
    },
    {
      id: "ruling-2",
      orderId: "order-2",
      version: 1,
      liableParty: "merchant",
      reason: "冷库出货慢，备货延误 52 分钟",
      delayMinutes: 52,
      penalty: 50,
      ruleLabel: "冷链单：迟到超过30分钟后，每5分钟扣订单金额4%，单笔封顶50元",
      status: "confirmed",
      createdAt: "2026-09-21T19:10:00.000Z",
      resolvedAt: "2026-09-21T21:00:00.000Z",
    },
    {
      id: "ruling-3a",
      orderId: "order-3",
      version: 1,
      liableParty: "rider",
      reason: "初判：骑手取餐慢导致迟到",
      delayMinutes: 50,
      penalty: 41.6,
      ruleLabel: "冷链单：迟到超过30分钟后，每5分钟扣订单金额4%，单笔封顶50元",
      status: "superseded",
      supersededFrom: "appealing",
      createdAt: "2026-09-23T12:05:00.000Z",
      resolvedAt: "2026-09-23T14:00:00.000Z",
    },
    {
      id: "ruling-3b",
      orderId: "order-3",
      version: 2,
      liableParty: "merchant",
      reason: "改判：复核监控为仓库备货延误，骑手免责",
      delayMinutes: 50,
      penalty: 41.6,
      ruleLabel: "冷链单：迟到超过30分钟后，每5分钟扣订单金额4%，单笔封顶50元",
      status: "confirmed",
      createdAt: "2026-09-24T09:30:00.000Z",
      resolvedAt: "2026-09-24T10:00:00.000Z",
    },
    {
      id: "ruling-4",
      orderId: "order-4",
      version: 1,
      liableParty: "rider",
      reason: "骑手申诉：小区门禁排队等待，金额冻结待复核",
      delayMinutes: 9,
      penalty: 1.8,
      ruleLabel: "普通单：每迟到5分钟扣订单金额2%，单笔封顶10元",
      status: "appealing",
      createdAt: "2026-09-24T14:00:00.000Z",
      resolvedAt: null,
    },
    {
      id: "ruling-5",
      orderId: "order-5",
      version: 1,
      liableParty: "rider",
      reason: "超时 3 分钟，待调度确认",
      delayMinutes: 3,
      penalty: 2.4,
      ruleLabel: "普通单：每迟到5分钟扣订单金额2%，单笔封顶10元",
      status: "pending",
      createdAt: "2026-09-25T19:40:00.000Z",
      resolvedAt: null,
    },
  ];

  return { orders, rulings };
}
