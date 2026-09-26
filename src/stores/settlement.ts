/**
 * 留档层：订单、判定版本与操作留档的状态与持久化。
 * 规则计算全部来自 domain/settlement，页面不直接写存储。
 */
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  computePenalty,
  isBillable,
  lateMinutes,
  settlementStateOf,
  ORDER_KIND_LABELS,
  RESPONSIBILITY_LABELS,
  type DecisionStatus,
  type OrderKind,
  type Responsibility,
  type SettlementState,
} from "../domain/settlement";

export interface SettlementOrder {
  id: string;
  code: string;
  kind: OrderKind;
  amount: number;
  promisedAt: string;
  actualAt: string;
  delayReason: string;
  createdAt: string;
}

export interface Decision {
  id: string;
  orderId: string;
  version: number;
  responsibility: Responsibility;
  note: string;
  lateMinutes: number;
  penalty: number;
  status: DecisionStatus;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  orderId: string;
  orderCode: string;
  action: string;
  detail: string;
}

export interface OrderSummary {
  order: SettlementOrder;
  late: number;
  preview: number;
  latest: Decision | null;
  state: SettlementState;
  /** 当前生效/冻结金额 */
  effective: number;
  versions: Decision[];
}

const STORAGE_KEY = "hxwlfront-15-settlement";

interface PersistShape {
  orders: SettlementOrder[];
  decisions: Decision[];
  audit: AuditEntry[];
}

function uid(): string {
  return crypto.randomUUID();
}

function isoHoursAgo(hours: number, minutes = 0): string {
  const date = new Date(Date.now() - hours * 3600000 - minutes * 60000);
  date.setSeconds(0, 0);
  return date.toISOString();
}

/** 首次打开时的演示数据：覆盖正常、扣款、冻结、改判、免责等场景 */
function seed(): PersistShape {
  const orders: SettlementOrder[] = [
    { id: uid(), code: "D20260926-001", kind: "normal", amount: 86, promisedAt: isoHoursAgo(5, 40), actualAt: isoHoursAgo(5, 17), delayReason: "午高峰等电梯时间长", createdAt: isoHoursAgo(6) },
    { id: uid(), code: "D20260926-002", kind: "coldchain", amount: 320, promisedAt: isoHoursAgo(4, 30), actualAt: isoHoursAgo(3, 20), delayReason: "商家出餐慢，冷链箱等待", createdAt: isoHoursAgo(6) },
    { id: uid(), code: "D20260926-003", kind: "normal", amount: 45, promisedAt: isoHoursAgo(2, 10), actualAt: isoHoursAgo(2, 2), delayReason: "小区门禁登记", createdAt: isoHoursAgo(3) },
    { id: uid(), code: "D20260926-004", kind: "coldchain", amount: 210, promisedAt: isoHoursAgo(3), actualAt: isoHoursAgo(2, 35), delayReason: "客户临时改约时间", createdAt: isoHoursAgo(4) },
    { id: uid(), code: "D20260926-005", kind: "normal", amount: 120, promisedAt: isoHoursAgo(8), actualAt: isoHoursAgo(7, 20), delayReason: "商家备货不足重新制作", createdAt: isoHoursAgo(9) },
  ];
  const [o1, o2, o3, o4, o5] = orders;
  const lateOf = (order: SettlementOrder) => lateMinutes(order.promisedAt, order.actualAt);
  const penaltyOf = (order: SettlementOrder) => computePenalty(order.kind, order.amount, lateOf(order)).amount;

  const decisions: Decision[] = [
    { id: uid(), orderId: o1.id, version: 1, responsibility: "rider", note: "轨迹确认绕路", lateMinutes: lateOf(o1), penalty: penaltyOf(o1), status: "confirmed", createdAt: isoHoursAgo(5) },
    { id: uid(), orderId: o2.id, version: 1, responsibility: "merchant", note: "出餐超时监控佐证", lateMinutes: lateOf(o2), penalty: penaltyOf(o2), status: "appealing", createdAt: isoHoursAgo(3) },
    { id: uid(), orderId: o3.id, version: 1, responsibility: "rider", note: "待调度复核", lateMinutes: lateOf(o3), penalty: penaltyOf(o3), status: "draft", createdAt: isoHoursAgo(1) },
    { id: uid(), orderId: o4.id, version: 1, responsibility: "customer", note: "客户电话确认改约", lateMinutes: lateOf(o4), penalty: 0, status: "confirmed", createdAt: isoHoursAgo(2) },
    { id: uid(), orderId: o5.id, version: 1, responsibility: "rider", note: "初判骑手取餐慢", lateMinutes: lateOf(o5), penalty: penaltyOf(o5), status: "superseded", createdAt: isoHoursAgo(7) },
    { id: uid(), orderId: o5.id, version: 2, responsibility: "merchant", note: "改判：出餐记录证明备货延误", lateMinutes: lateOf(o5), penalty: penaltyOf(o5), status: "confirmed", createdAt: isoHoursAgo(6) },
  ];

  const audit: AuditEntry[] = [
    { id: uid(), at: isoHoursAgo(7), orderId: o5.id, orderCode: o5.code, action: "确认判定", detail: `v1 ${RESPONSIBILITY_LABELS.rider}，扣款 ¥${penaltyOf(o5)}` },
    { id: uid(), at: isoHoursAgo(6, 30), orderId: o5.id, orderCode: o5.code, action: "发起申诉", detail: "骑手提交出餐小票" },
    { id: uid(), at: isoHoursAgo(6), orderId: o5.id, orderCode: o5.code, action: "改判", detail: `v1 → v2，责任方改为${RESPONSIBILITY_LABELS.merchant}` },
    { id: uid(), at: isoHoursAgo(3), orderId: o2.id, orderCode: o2.code, action: "发起申诉", detail: "商家对冷链扣款提出异议，金额冻结" },
  ];
  return { orders, decisions, audit };
}

function load(): PersistShape {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return seed();
  try {
    const parsed = JSON.parse(raw) as PersistShape;
    if (!Array.isArray(parsed.orders) || !Array.isArray(parsed.decisions)) return seed();
    return { orders: parsed.orders, decisions: parsed.decisions, audit: parsed.audit ?? [] };
  } catch {
    return seed();
  }
}

export const useSettlementStore = defineStore("settlement", () => {
  const initial = load();
  const orders = ref<SettlementOrder[]>(initial.orders);
  const decisions = ref<Decision[]>(initial.decisions);
  const audit = ref<AuditEntry[]>(initial.audit);

  function persist() {
    const shape: PersistShape = { orders: orders.value, decisions: decisions.value, audit: audit.value };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shape));
  }

  function log(order: SettlementOrder, action: string, detail: string) {
    audit.value = [
      { id: uid(), at: new Date().toISOString(), orderId: order.id, orderCode: order.code, action, detail },
      ...audit.value,
    ];
  }

  function decisionsOf(orderId: string): Decision[] {
    return decisions.value
      .filter((decision) => decision.orderId === orderId)
      .sort((a, b) => b.version - a.version);
  }

  function latestOf(orderId: string): Decision | null {
    return decisionsOf(orderId)[0] ?? null;
  }

  const summaries = computed<OrderSummary[]>(() =>
    orders.value.map((order) => {
      const late = lateMinutes(order.promisedAt, order.actualAt);
      const preview = computePenalty(order.kind, order.amount, late).amount;
      const versions = decisionsOf(order.id);
      const latest = versions[0] ?? null;
      const state = settlementStateOf(latest);
      const effective = latest && (latest.status === "confirmed" || latest.status === "appealing") && isBillable(latest.responsibility)
        ? latest.penalty
        : 0;
      return { order, late, preview, latest, state, effective, versions };
    })
  );

  const totals = computed(() => {
    const list = summaries.value;
    return {
      count: list.length,
      deducted: list.filter((item) => item.state === "deducted").reduce((sum, item) => sum + item.effective, 0),
      frozen: list.filter((item) => item.state === "frozen").reduce((sum, item) => sum + item.effective, 0),
      appealing: list.filter((item) => item.state === "frozen").length,
    };
  });

  function addOrder(payload: Omit<SettlementOrder, "id" | "createdAt">) {
    const order: SettlementOrder = { ...payload, id: uid(), createdAt: new Date().toISOString() };
    orders.value = [order, ...orders.value];
    log(order, "录入订单", `${ORDER_KIND_LABELS[order.kind]} ¥${order.amount}，迟到 ${lateMinutes(order.promisedAt, order.actualAt)} 分钟`);
    persist();
  }

  function removeOrder(orderId: string) {
    const order = orders.value.find((item) => item.id === orderId);
    if (!order) return;
    orders.value = orders.value.filter((item) => item.id !== orderId);
    decisions.value = decisions.value.filter((decision) => decision.orderId !== orderId);
    log(order, "删除订单", "订单及其判定记录已移除，留档保留本条目");
    persist();
  }

  /** 生成判定草稿；已有草稿则覆盖为下一版草稿 */
  function draftDecision(orderId: string, responsibility: Responsibility, note: string) {
    const order = orders.value.find((item) => item.id === orderId);
    if (!order) return;
    const late = lateMinutes(order.promisedAt, order.actualAt);
    const penalty = isBillable(responsibility) ? computePenalty(order.kind, order.amount, late).amount : 0;
    const versions = decisionsOf(orderId);
    const latest = versions[0] ?? null;
    if (latest && latest.status === "draft") {
      latest.responsibility = responsibility;
      latest.note = note;
      latest.lateMinutes = late;
      latest.penalty = penalty;
      latest.createdAt = new Date().toISOString();
      log(order, "修改判定草稿", `v${latest.version} ${RESPONSIBILITY_LABELS[responsibility]}，试算扣款 ¥${penalty}`);
    } else {
      const version = (latest?.version ?? 0) + 1;
      decisions.value.push({
        id: uid(), orderId, version, responsibility, note,
        lateMinutes: late, penalty, status: "draft", createdAt: new Date().toISOString(),
      });
      log(order, "录入判定", `v${version} ${RESPONSIBILITY_LABELS[responsibility]}，试算扣款 ¥${penalty}`);
    }
    persist();
  }

  function findDecision(decisionId: string): Decision | undefined {
    return decisions.value.find((decision) => decision.id === decisionId);
  }

  function orderOf(decision: Decision): SettlementOrder | undefined {
    return orders.value.find((item) => item.id === decision.orderId);
  }

  function confirmDecision(decisionId: string) {
    const decision = findDecision(decisionId);
    if (!decision || decision.status !== "draft") return;
    decision.status = "confirmed";
    const order = orderOf(decision);
    if (order) {
      const billable = isBillable(decision.responsibility) && decision.penalty > 0;
      log(order, "确认判定", `v${decision.version} ${RESPONSIBILITY_LABELS[decision.responsibility]}，${billable ? `扣款 ¥${decision.penalty} 生效` : "无需扣款"}`);
    }
    persist();
  }

  function appealDecision(decisionId: string, note: string) {
    const decision = findDecision(decisionId);
    if (!decision || decision.status !== "confirmed") return;
    decision.status = "appealing";
    const order = orderOf(decision);
    if (order) log(order, "发起申诉", `v${decision.version} 冻结 ¥${decision.penalty}${note ? `，理由：${note}` : ""}`);
    persist();
  }

  function upholdAppeal(decisionId: string, note: string) {
    const decision = findDecision(decisionId);
    if (!decision || decision.status !== "appealing") return;
    decision.status = "confirmed";
    const order = orderOf(decision);
    if (order) log(order, "申诉维持", `v${decision.version} 解冻并恢复扣款 ¥${decision.penalty}${note ? `，说明：${note}` : ""}`);
    persist();
  }

  /** 改判：旧版本标记 superseded 留档可查，生成新版本并直接确认 */
  function overturnDecision(decisionId: string, responsibility: Responsibility, note: string) {
    const decision = findDecision(decisionId);
    if (!decision || decision.status !== "appealing") return;
    const order = orderOf(decision);
    if (!order) return;
    decision.status = "superseded";
    const late = lateMinutes(order.promisedAt, order.actualAt);
    const penalty = isBillable(responsibility) ? computePenalty(order.kind, order.amount, late).amount : 0;
    const version = decision.version + 1;
    decisions.value.push({
      id: uid(), orderId: order.id, version, responsibility,
      note: note || `改判自 v${decision.version}`,
      lateMinutes: late, penalty, status: "confirmed", createdAt: new Date().toISOString(),
    });
    log(order, "改判", `v${decision.version} → v${version}，责任方改为${RESPONSIBILITY_LABELS[responsibility]}，扣款 ¥${penalty}`);
    persist();
  }

  return {
    orders, decisions, audit, summaries, totals,
    addOrder, removeOrder, draftDecision, confirmDecision,
    appealDecision, upholdAppeal, overturnDecision,
  };
});
