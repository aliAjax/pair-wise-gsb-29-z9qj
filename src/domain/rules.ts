import type { Order, OrderType } from "./types";

export interface PenaltyRule {
  graceMinutes: number; // 宽限分钟数，超过才开始计费
  blockMinutes: number; // 计费粒度（分钟），不足一粒度按一粒度计
  ratePerBlock: number; // 每粒度扣订单金额的比例
  cap: number; // 单笔封顶（元）
  label: string;
}

/**
 * 时效扣款规则（唯一事实来源，页面只读引用）：
 * - 普通单：每迟到 5 分钟扣订单金额 2%，封顶 10 元
 * - 冷链单：迟到超过 30 分钟后，每 5 分钟扣订单金额 4%，封顶 50 元
 */
export const PENALTY_RULES: Record<OrderType, PenaltyRule> = {
  normal: {
    graceMinutes: 0,
    blockMinutes: 5,
    ratePerBlock: 0.02,
    cap: 10,
    label: "普通单：每迟到5分钟扣订单金额2%，单笔封顶10元",
  },
  cold: {
    graceMinutes: 30,
    blockMinutes: 5,
    ratePerBlock: 0.04,
    cap: 50,
    label: "冷链单：迟到超过30分钟后，每5分钟扣订单金额4%，单笔封顶50元",
  },
};

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** 迟到分钟数；未送达或早于承诺时间记 0 */
export function delayMinutesOf(order: Pick<Order, "promisedAt" | "actualAt">): number {
  if (!order.actualAt) return 0;
  const diff = new Date(order.actualAt).getTime() - new Date(order.promisedAt).getTime();
  return Math.max(0, Math.floor(diff / 60000));
}

export interface PenaltyQuote {
  units: number; // 计费粒度数
  penalty: number; // 应扣金额（元）
  rule: PenaltyRule;
}

export function quotePenalty(type: OrderType, amount: number, delayMinutes: number): PenaltyQuote {
  const rule = PENALTY_RULES[type];
  const billable = delayMinutes - rule.graceMinutes;
  const units = billable > 0 ? Math.ceil(billable / rule.blockMinutes) : 0;
  const penalty = Math.min(round2(amount * rule.ratePerBlock * units), rule.cap);
  return { units, penalty, rule };
}
