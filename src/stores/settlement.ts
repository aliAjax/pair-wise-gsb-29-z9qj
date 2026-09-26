import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { loadArchive, saveArchive } from "../archive/storage";
import { delayMinutesOf, quotePenalty, round2 } from "../domain/rules";
import {
  DEDUCTIBLE_PARTIES,
  type LiableParty,
  type Order,
  type OrderType,
  type Ruling,
} from "../domain/types";
import { monthKeyOf } from "../utils/format";

/** 订单结算状态（由最新有效判定推导） */
export type SettlementState =
  | "delivering" // 配送中
  | "onTime" // 准时
  | "unruled" // 迟到待定责
  | "pending" // 待确认
  | "appealing" // 申诉冻结
  | "deducted" // 已扣款
  | "cleared"; // 已确认·免扣

export const SETTLEMENT_STATE_LABELS: Record<SettlementState, string> = {
  delivering: "配送中",
  onTime: "准时",
  unruled: "待定责",
  pending: "待确认",
  appealing: "申诉冻结",
  deducted: "已扣款",
  cleared: "已确认·免扣",
};

export interface SettlementView {
  order: Order;
  delayMinutes: number;
  quotedPenalty: number; // 按规则核算金额
  ruleLabel: string;
  state: SettlementState;
  stateLabel: string;
  activeRuling: Ruling | null; // 最新有效判定
  versions: Ruling[]; // 全部判定版本，新→旧
}

export interface NewOrderInput {
  code: string;
  type: OrderType;
  amount: number;
  rider: string;
  address: string;
  promisedAt: string;
  actualAt: string | null;
  delayReason: string;
}

export const useSettlementStore = defineStore("settlement", () => {
  const archive = loadArchive();
  const orders = ref<Order[]>(archive.orders);
  const rulings = ref<Ruling[]>(archive.rulings);

  function persist() {
    saveArchive({ orders: orders.value, rulings: rulings.value });
  }

  function versionsOf(orderId: string): Ruling[] {
    return rulings.value
      .filter((ruling) => ruling.orderId === orderId)
      .sort((a, b) => b.version - a.version);
  }

  function activeRulingOf(orderId: string): Ruling | null {
    return versionsOf(orderId).find((ruling) => ruling.status !== "superseded") ?? null;
  }

  function settlementView(order: Order): SettlementView {
    const versions = versionsOf(order.id);
    const activeRuling = versions.find((ruling) => ruling.status !== "superseded") ?? null;
    const delayMinutes = delayMinutesOf(order);
    const quote = quotePenalty(order.type, order.amount, delayMinutes);

    let state: SettlementState;
    if (!order.actualAt) state = "delivering";
    else if (delayMinutes === 0) state = "onTime";
    else if (!activeRuling) state = "unruled";
    else if (activeRuling.status === "pending") state = "pending";
    else if (activeRuling.status === "appealing") state = "appealing";
    else state = activeRuling.penalty > 0 ? "deducted" : "cleared";

    return {
      order,
      delayMinutes,
      quotedPenalty: quote.penalty,
      ruleLabel: quote.rule.label,
      state,
      stateLabel: SETTLEMENT_STATE_LABELS[state],
      activeRuling,
      versions,
    };
  }

  const views = computed<SettlementView[]>(() =>
    [...orders.value]
      .sort((a, b) => b.promisedAt.localeCompare(a.promisedAt))
      .map(settlementView)
  );

  const totals = computed(() => {
    const active = rulings.value.filter((ruling) => ruling.status !== "superseded");
    const sumOf = (status: Ruling["status"]) =>
      round2(
        active
          .filter((ruling) => ruling.status === status)
          .reduce((acc, ruling) => acc + ruling.penalty, 0)
      );
    return {
      orders: orders.value.length,
      late: orders.value.filter((order) => delayMinutesOf(order) > 0).length,
      confirmed: sumOf("confirmed"), // 已确认扣款
      frozen: sumOf("appealing"), // 申诉冻结
      pending: sumOf("pending"), // 待确认
    };
  });

  /** 月底结算分月汇总，按承诺送达月份归集 */
  const monthlySummary = computed(() => {
    const rows = new Map<
      string,
      { month: string; orders: number; late: number; confirmed: number; frozen: number }
    >();
    const ensure = (month: string) => {
      if (!rows.has(month)) rows.set(month, { month, orders: 0, late: 0, confirmed: 0, frozen: 0 });
      return rows.get(month)!;
    };
    for (const order of orders.value) {
      const row = ensure(monthKeyOf(order.promisedAt));
      row.orders += 1;
      if (delayMinutesOf(order) > 0) row.late += 1;
    }
    for (const ruling of rulings.value) {
      if (ruling.status === "superseded") continue;
      const order = orders.value.find((item) => item.id === ruling.orderId);
      if (!order) continue;
      const row = ensure(monthKeyOf(order.promisedAt));
      if (ruling.status === "confirmed") row.confirmed = round2(row.confirmed + ruling.penalty);
      if (ruling.status === "appealing") row.frozen = round2(row.frozen + ruling.penalty);
    }
    return [...rows.values()].sort((a, b) => b.month.localeCompare(a.month));
  });

  function suggestOrderCode(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const prefix = `SO${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const count = orders.value.filter((order) => order.code.startsWith(prefix)).length;
    return `${prefix}${String(count + 1).padStart(2, "0")}`;
  }

  function addOrder(input: NewOrderInput) {
    orders.value.unshift({
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });
    persist();
  }

  function markDelivered(orderId: string) {
    const order = orders.value.find((item) => item.id === orderId);
    if (!order || order.actualAt) return;
    order.actualAt = new Date().toISOString();
    persist();
  }

  function removeOrder(orderId: string) {
    orders.value = orders.value.filter((order) => order.id !== orderId);
    rulings.value = rulings.value.filter((ruling) => ruling.orderId !== orderId);
    persist();
  }

  /** 定责：为迟到订单生成一版判定（待确认）。客户/不可抗力免责，扣款记 0。 */
  function createRuling(orderId: string, liableParty: LiableParty, reason: string) {
    const order = orders.value.find((item) => item.id === orderId);
    if (!order || activeRulingOf(orderId)) return;
    const delayMinutes = delayMinutesOf(order);
    if (delayMinutes <= 0) return;
    const quote = quotePenalty(order.type, order.amount, delayMinutes);
    const deductible = DEDUCTIBLE_PARTIES.includes(liableParty);
    const nextVersion = versionsOf(orderId).reduce((max, ruling) => Math.max(max, ruling.version), 0) + 1;
    rulings.value.push({
      id: crypto.randomUUID(),
      orderId,
      version: nextVersion,
      liableParty,
      reason,
      delayMinutes,
      penalty: deductible ? quote.penalty : 0,
      ruleLabel: quote.rule.label,
      status: "pending",
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    });
    persist();
  }

  /** 确认：只有确认后的责任单才实际扣款 */
  function confirmRuling(rulingId: string) {
    const ruling = rulings.value.find((item) => item.id === rulingId);
    if (!ruling || ruling.status !== "pending") return;
    ruling.status = "confirmed";
    ruling.resolvedAt = new Date().toISOString();
    persist();
  }

  /** 申诉：未结先冻结，金额不计入已扣 */
  function appealRuling(rulingId: string) {
    const ruling = rulings.value.find((item) => item.id === rulingId);
    if (!ruling || (ruling.status !== "pending" && ruling.status !== "confirmed")) return;
    ruling.status = "appealing";
    persist();
  }

  /** 申诉驳回：维持原判定，恢复已确认 */
  function upholdRuling(rulingId: string) {
    const ruling = rulings.value.find((item) => item.id === rulingId);
    if (!ruling || ruling.status !== "appealing") return;
    ruling.status = "confirmed";
    ruling.resolvedAt = new Date().toISOString();
    persist();
  }

  /** 改判：当前版本作废留档，生成新版本（待确认），旧决定可查 */
  function rejudgeRuling(rulingId: string, liableParty: LiableParty, reason: string) {
    const current = rulings.value.find((item) => item.id === rulingId);
    if (!current || current.status === "superseded") return;
    current.supersededFrom = current.status;
    current.status = "superseded";
    const orderId = current.orderId;
    persist();
    createRuling(orderId, liableParty, reason);
  }

  return {
    orders,
    rulings,
    views,
    totals,
    monthlySummary,
    suggestOrderCode,
    addOrder,
    markDelivered,
    removeOrder,
    createRuling,
    confirmRuling,
    appealRuling,
    upholdRuling,
    rejudgeRuling,
  };
});
