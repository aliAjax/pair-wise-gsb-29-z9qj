/**
 * 时效结算规则层（纯函数，不依赖页面与存储）。
 * 调整扣款标准只改这里，结算台与留档会自动按新规则试算。
 */

export type OrderKind = "normal" | "coldchain";

/** 责任方：骑手 / 商家备货 / 客户 / 平台或天气 */
export type Responsibility = "rider" | "merchant" | "customer" | "platform";

export const ORDER_KIND_LABELS: Record<OrderKind, string> = {
  normal: "普通单",
  coldchain: "冷链单",
};

export const RESPONSIBILITY_LABELS: Record<Responsibility, string> = {
  rider: "骑手原因",
  merchant: "备货延误",
  customer: "客户原因",
  platform: "平台/天气",
};

/** 会产生扣款的责任方（其余责任方免责） */
const BILLABLE: readonly Responsibility[] = ["rider", "merchant"];

export function isBillable(party: Responsibility): boolean {
  return BILLABLE.includes(party);
}

export interface PenaltyRule {
  /** 宽限分钟数：迟到不超过该时长不扣款 */
  graceMinutes: number;
  /** 计费步长：每满一个步长计一次（不足一步按一步计） */
  stepMinutes: number;
  /** 每个步长扣订单金额的比例 */
  ratePerStep: number;
  /** 单笔封顶金额（元） */
  cap: number;
}

export const PENALTY_RULES: Record<OrderKind, PenaltyRule> = {
  // 普通单：每迟到 5 分钟扣 2%，最多 10 元
  normal: { graceMinutes: 0, stepMinutes: 5, ratePerStep: 0.02, cap: 10 },
  // 冷链单：迟到超过 30 分钟后，每 5 分钟扣 4%，最多 50 元
  coldchain: { graceMinutes: 30, stepMinutes: 5, ratePerStep: 0.04, cap: 50 },
};

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 迟到分钟数（实际送达晚于承诺送达，不为负） */
export function lateMinutes(promisedAt: string, actualAt: string): number {
  const promised = new Date(promisedAt).getTime();
  const actual = new Date(actualAt).getTime();
  if (Number.isNaN(promised) || Number.isNaN(actual)) return 0;
  return Math.max(0, Math.floor((actual - promised) / 60000));
}

export interface PenaltyBreakdown {
  kind: OrderKind;
  lateMinutes: number;
  /** 扣除宽限后的计费分钟数 */
  billableMinutes: number;
  /** 计费步数 */
  steps: number;
  ratePerStep: number;
  /** 封顶前金额 */
  raw: number;
  cap: number;
  /** 最终扣款（已封顶，保留两位小数） */
  amount: number;
  /** 是否触发封顶 */
  capped: boolean;
}

/** 按订单类型试算扣款，返回完整过程便于对账 */
export function computePenalty(kind: OrderKind, orderAmount: number, late: number): PenaltyBreakdown {
  const rule = PENALTY_RULES[kind];
  const billableMinutes = late > rule.graceMinutes ? late - rule.graceMinutes : 0;
  const steps = billableMinutes > 0 ? Math.ceil(billableMinutes / rule.stepMinutes) : 0;
  const raw = round2(orderAmount * rule.ratePerStep * steps);
  const amount = Math.min(raw, rule.cap);
  return {
    kind,
    lateMinutes: late,
    billableMinutes,
    steps,
    ratePerStep: rule.ratePerStep,
    raw,
    cap: rule.cap,
    amount,
    capped: raw > rule.cap,
  };
}

/** 规则的一句话说明，用于页面展示 */
export function describeRule(kind: OrderKind): string {
  const rule = PENALTY_RULES[kind];
  const rate = `${round2(rule.ratePerStep * 100)}%`;
  if (rule.graceMinutes > 0) {
    return `迟到超过${rule.graceMinutes}分钟后，每${rule.stepMinutes}分钟扣${rate}，单笔最多${rule.cap}元`;
  }
  return `每迟到${rule.stepMinutes}分钟扣${rate}，单笔最多${rule.cap}元`;
}

/** 决定（判定）状态 */
export type DecisionStatus = "draft" | "confirmed" | "appealing" | "superseded";

export const DECISION_STATUS_LABELS: Record<DecisionStatus, string> = {
  draft: "待确认",
  confirmed: "已确认",
  appealing: "申诉中·冻结",
  superseded: "已被改判",
};

/** 订单结算状态（由最新有效决定推导） */
export type SettlementState = "unsettled" | "pending" | "deducted" | "frozen" | "exempt";

export const SETTLEMENT_STATE_LABELS: Record<SettlementState, string> = {
  unsettled: "未判定",
  pending: "待确认",
  deducted: "已扣款",
  frozen: "冻结中",
  exempt: "无需扣款",
};

export interface DecisionLike {
  status: DecisionStatus;
  responsibility: Responsibility;
  penalty: number;
}

/** 由最新有效决定推导订单结算状态 */
export function settlementStateOf(latest: DecisionLike | null): SettlementState {
  if (!latest) return "unsettled";
  if (latest.status === "draft") return "pending";
  if (latest.status === "appealing") return "frozen";
  if (latest.status === "confirmed") {
    return isBillable(latest.responsibility) && latest.penalty > 0 ? "deducted" : "exempt";
  }
  return "unsettled";
}
