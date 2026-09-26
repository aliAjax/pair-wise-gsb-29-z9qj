export type OrderType = "normal" | "cold";
export type LiableParty = "rider" | "merchant" | "customer" | "forceMajeure";
export type RulingStatus = "pending" | "confirmed" | "appealing" | "superseded";

export interface Order {
  id: string;
  code: string; // 订单号，结算核对用
  type: OrderType;
  amount: number; // 订单金额（元）
  promisedAt: string; // 承诺送达时间
  actualAt: string | null; // 实际送达时间，null 表示配送中
  delayReason: string; // 延迟原因（骑手原因 / 备货延误 …）
  rider: string;
  address: string;
  createdAt: string;
}

/** 责任判定。每次改判生成新版本，旧版本保留为 superseded 可查。 */
export interface Ruling {
  id: string;
  orderId: string;
  version: number;
  liableParty: LiableParty;
  reason: string; // 定责说明，留档
  delayMinutes: number; // 判定时快照
  penalty: number; // 判定时快照（元）
  ruleLabel: string; // 判定时适用的规则文案快照
  status: RulingStatus;
  createdAt: string;
  resolvedAt: string | null;
  supersededFrom?: RulingStatus; // 作废前的状态，便于追溯
}

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  normal: "普通单",
  cold: "冷链单",
};

export const LIABLE_PARTY_LABELS: Record<LiableParty, string> = {
  rider: "骑手",
  merchant: "商家/仓库",
  customer: "客户",
  forceMajeure: "不可抗力",
};

export const RULING_STATUS_LABELS: Record<RulingStatus, string> = {
  pending: "待确认",
  confirmed: "已确认",
  appealing: "申诉中",
  superseded: "已作废",
};

/** 只有这两类责任方会产生实际扣款，客户/不可抗力免责 */
export const DEDUCTIBLE_PARTIES: readonly LiableParty[] = ["rider", "merchant"];

export const DELAY_REASONS = [
  "骑手原因",
  "备货延误",
  "天气异常",
  "客户改址",
  "交通管控",
] as const;

export const RIDERS = ["骑手A", "骑手B", "骑手C"] as const;
