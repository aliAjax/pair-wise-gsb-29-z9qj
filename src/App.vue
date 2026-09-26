<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import {
  computePenalty,
  describeRule,
  DECISION_STATUS_LABELS,
  ORDER_KIND_LABELS,
  RESPONSIBILITY_LABELS,
  SETTLEMENT_STATE_LABELS,
  type OrderKind,
  type Responsibility,
  type SettlementState,
} from "./domain/settlement";
import { useSettlementStore, type OrderSummary } from "./stores/settlement";

const store = useSettlementStore();

const responsibilities = Object.keys(RESPONSIBILITY_LABELS) as Responsibility[];
const stateFilters: Array<"all" | SettlementState> = ["all", "unsettled", "pending", "deducted", "frozen", "exempt"];

function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const now = new Date();
const form = reactive({
  code: `D${Date.now().toString().slice(-8)}`,
  kind: "normal" as OrderKind,
  amount: 50,
  promisedAt: toLocalInput(now),
  actualAt: toLocalInput(new Date(now.getTime() + 20 * 60000)),
  delayReason: "",
});

const search = ref("");
const stateFilter = ref<"all" | SettlementState>("all");

/** 每张卡片的交互状态（申诉/改判/历史展开与草稿输入） */
type CardUi = {
  responsibility: Responsibility;
  note: string;
  appealNote: string;
  overturnResponsibility: Responsibility;
  overturnNote: string;
  showAppeal: boolean;
  showOverturn: boolean;
  showHistory: boolean;
};
const ui = reactive<Record<string, CardUi>>({});

function cardUi(orderId: string): CardUi {
  if (!ui[orderId]) {
    ui[orderId] = {
      responsibility: "rider",
      note: "",
      appealNote: "",
      overturnResponsibility: "merchant",
      overturnNote: "",
      showAppeal: false,
      showOverturn: false,
      showHistory: false,
    };
  }
  return ui[orderId];
}

const filtered = computed(() =>
  store.summaries.filter((item) => {
    const keyword = search.value.trim();
    const matchKeyword = !keyword || item.order.code.includes(keyword);
    const matchState = stateFilter.value === "all" || item.state === stateFilter.value;
    return matchKeyword && matchState;
  })
);

const filteredAudit = computed(() => {
  const keyword = search.value.trim();
  if (!keyword) return store.audit;
  return store.audit.filter((entry) => entry.orderCode.includes(keyword));
});

const chartRows = computed(() =>
  (Object.keys(SETTLEMENT_STATE_LABELS) as SettlementState[]).map((state) => ({
    state,
    label: SETTLEMENT_STATE_LABELS[state],
    value: store.summaries.filter((item) => item.state === state).length,
  }))
);
const maxChart = computed(() => Math.max(1, ...chartRows.value.map((row) => row.value)));

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

function fmtMoney(value: number): string {
  return `¥${value.toFixed(2)}`;
}

/** 表单试算：日期未填或非法时按 0 分钟处理，避免渲染报错 */
const formLate = computed(() => {
  const promised = new Date(form.promisedAt).getTime();
  const actual = new Date(form.actualAt).getTime();
  if (Number.isNaN(promised) || Number.isNaN(actual)) return 0;
  return Math.max(0, Math.floor((actual - promised) / 60000));
});

const formPenalty = computed(() => computePenalty(form.kind, Number(form.amount) || 0, formLate.value).amount);

function breakdownText(item: OrderSummary): string {
  const detail = computePenalty(item.order.kind, item.order.amount, item.late);
  if (detail.steps === 0) return `迟到 ${detail.lateMinutes} 分钟，未触发扣款`;
  const capped = detail.capped ? `，封顶 ${detail.cap} 元` : "";
  return `迟到 ${detail.lateMinutes} 分钟，计 ${detail.steps} 步 × ${(detail.ratePerStep * 100).toFixed(0)}%${capped}`;
}

function submitOrder() {
  store.addOrder({
    code: form.code.trim(),
    kind: form.kind,
    amount: Number(form.amount),
    promisedAt: new Date(form.promisedAt).toISOString(),
    actualAt: new Date(form.actualAt).toISOString(),
    delayReason: form.delayReason.trim() || "未填写",
  });
  form.code = `D${Date.now().toString().slice(-8)}`;
  form.delayReason = "";
}

function saveDraft(item: OrderSummary) {
  const card = cardUi(item.order.id);
  store.draftDecision(item.order.id, card.responsibility, card.note.trim());
  card.note = "";
}

function confirm(item: OrderSummary) {
  if (item.latest) store.confirmDecision(item.latest.id);
}

function appeal(item: OrderSummary) {
  const card = cardUi(item.order.id);
  if (item.latest) store.appealDecision(item.latest.id, card.appealNote.trim());
  card.appealNote = "";
  card.showAppeal = false;
}

function uphold(item: OrderSummary) {
  if (item.latest) store.upholdAppeal(item.latest.id, "");
}

function overturn(item: OrderSummary) {
  const card = cardUi(item.order.id);
  if (item.latest) store.overturnDecision(item.latest.id, card.overturnResponsibility, card.overturnNote.trim());
  card.overturnNote = "";
  card.showOverturn = false;
}

function removeOrder(item: OrderSummary) {
  if (window.confirm(`确认删除订单 ${item.order.code}？其判定记录将一并移除。`)) {
    store.removeOrder(item.order.id);
  }
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">物流行业 · 月底结算对账</p>
          <h1>时效结算台</h1>
          <p class="subtitle">
            每单记录订单金额、承诺与实际送达、延迟原因；按规则试算扣款，确认后的责任单才扣款，申诉未结先冻结，改判留痕可查。
          </p>
        </div>
        <div class="stack">
          <span class="tag">普通单：{{ describeRule("normal") }}</span>
          <span class="tag">冷链单：{{ describeRule("coldchain") }}</span>
        </div>
      </header>

      <section class="metrics">
        <article class="metric">
          <span>订单数</span>
          <strong>{{ store.totals.count }}</strong>
        </article>
        <article class="metric">
          <span>已确认扣款</span>
          <strong>{{ fmtMoney(store.totals.deducted) }}</strong>
        </article>
        <article class="metric">
          <span>申诉冻结金额</span>
          <strong>{{ fmtMoney(store.totals.frozen) }}</strong>
        </article>
        <article class="metric">
          <span>申诉中订单</span>
          <strong>{{ store.totals.appealing }}</strong>
        </article>
      </section>

      <section class="workspace">
        <form class="panel" @submit.prevent="submitOrder">
          <h2>录入订单</h2>
          <div class="form-grid">
            <label>
              订单号
              <input v-model="form.code" required placeholder="如 D20260926-006" />
            </label>
            <label>
              订单类型
              <select v-model="form.kind">
                <option v-for="(label, kind) in ORDER_KIND_LABELS" :key="kind" :value="kind">{{ label }}</option>
              </select>
            </label>
            <label>
              订单金额（元）
              <input v-model="form.amount" type="number" min="0.01" step="0.01" required />
            </label>
            <label>
              承诺送达
              <input v-model="form.promisedAt" type="datetime-local" required />
            </label>
            <label>
              实际送达
              <input v-model="form.actualAt" type="datetime-local" required />
            </label>
            <label>
              延迟原因
              <textarea v-model="form.delayReason" placeholder="现场记录的延迟原因，如出餐慢、门禁等待" />
            </label>
            <p class="hint">
              试算：迟到 {{ formLate }} 分钟，若责任成立扣 {{ fmtMoney(formPenalty) }}
            </p>
            <button type="submit">加入结算台</button>
          </div>
        </form>

        <section class="list-panel">
          <div class="toolbar">
            <h2>结算单列表</h2>
            <input v-model="search" class="search" placeholder="按订单号核对，如 D20260926-005" />
            <select v-model="stateFilter">
              <option value="all">全部状态</option>
              <option v-for="state in stateFilters.slice(1)" :key="state" :value="state">
                {{ SETTLEMENT_STATE_LABELS[state] }}
              </option>
            </select>
          </div>

          <div class="record-grid">
            <div v-if="filtered.length === 0" class="empty">暂无匹配订单</div>
            <article v-for="item in filtered" :key="item.order.id" class="record">
              <div class="record-head">
                <p class="record-title">
                  {{ item.order.code }}
                  <span class="kind" :class="item.order.kind">{{ ORDER_KIND_LABELS[item.order.kind] }}</span>
                </p>
                <span class="status" :class="`state-${item.state}`">{{ SETTLEMENT_STATE_LABELS[item.state] }}</span>
              </div>

              <div class="details">
                <span>订单金额：{{ fmtMoney(item.order.amount) }}</span>
                <span>承诺送达：{{ fmtTime(item.order.promisedAt) }}</span>
                <span>实际送达：{{ fmtTime(item.order.actualAt) }}</span>
                <span>迟到：{{ item.late }} 分钟</span>
              </div>
              <p class="note">延迟原因：{{ item.order.delayReason }}</p>
              <p class="rule-line">规则试算：{{ breakdownText(item) }}，责任成立扣 {{ fmtMoney(item.preview) }}</p>

              <div v-if="item.latest" class="decision" :class="`decision-${item.latest.status}`">
                <strong>当前判定 v{{ item.latest.version }}</strong>
                <span>{{ RESPONSIBILITY_LABELS[item.latest.responsibility] }} · {{ DECISION_STATUS_LABELS[item.latest.status] }}</span>
                <span>扣款 {{ fmtMoney(item.latest.penalty) }}（判定时迟到 {{ item.latest.lateMinutes }} 分钟）</span>
                <span v-if="item.latest.note">说明：{{ item.latest.note }}</span>
              </div>

              <!-- 未判定 / 草稿：录入或修改判定 -->
              <div v-if="item.state === 'unsettled' || item.state === 'pending'" class="action-block">
                <div class="inline-form">
                  <select v-model="cardUi(item.order.id).responsibility">
                    <option v-for="party in responsibilities" :key="party" :value="party">
                      {{ RESPONSIBILITY_LABELS[party] }}
                    </option>
                  </select>
                  <input v-model="cardUi(item.order.id).note" placeholder="判定说明，如轨迹、小票佐证" />
                  <button type="button" @click="saveDraft(item)">
                    {{ item.state === "pending" ? "保存草稿" : "生成判定" }}
                  </button>
                  <button v-if="item.state === 'pending'" type="button" @click="confirm(item)">确认生效</button>
                </div>
              </div>

              <!-- 已确认：可发起申诉 -->
              <div v-if="item.state === 'deducted' || item.state === 'exempt'" class="action-block">
                <div v-if="!cardUi(item.order.id).showAppeal" class="actions">
                  <button v-if="item.state === 'deducted'" type="button" class="secondary" @click="cardUi(item.order.id).showAppeal = true">发起申诉</button>
                </div>
                <div v-else class="inline-form">
                  <input v-model="cardUi(item.order.id).appealNote" placeholder="申诉理由，冻结期间不扣款" />
                  <button type="button" @click="appeal(item)">提交申诉并冻结</button>
                  <button type="button" class="secondary" @click="cardUi(item.order.id).showAppeal = false">取消</button>
                </div>
              </div>

              <!-- 申诉中：维持或改判 -->
              <div v-if="item.state === 'frozen'" class="action-block">
                <div class="actions">
                  <button type="button" @click="uphold(item)">维持原判</button>
                  <button type="button" class="secondary" @click="cardUi(item.order.id).showOverturn = !cardUi(item.order.id).showOverturn">
                    改判
                  </button>
                </div>
                <div v-if="cardUi(item.order.id).showOverturn" class="inline-form">
                  <select v-model="cardUi(item.order.id).overturnResponsibility">
                    <option v-for="party in responsibilities" :key="party" :value="party">
                      {{ RESPONSIBILITY_LABELS[party] }}
                    </option>
                  </select>
                  <input v-model="cardUi(item.order.id).overturnNote" placeholder="改判依据，将生成新版本" />
                  <button type="button" @click="overturn(item)">确认改判</button>
                </div>
              </div>

              <div class="actions">
                <button type="button" class="secondary" @click="cardUi(item.order.id).showHistory = !cardUi(item.order.id).showHistory">
                  {{ cardUi(item.order.id).showHistory ? "收起版本" : `判定版本（${item.versions.length}）` }}
                </button>
                <button type="button" class="danger" @click="removeOrder(item)">删除</button>
              </div>

              <div v-if="cardUi(item.order.id).showHistory && item.versions.length" class="history">
                <div v-for="version in item.versions" :key="version.id" class="history-row">
                  <span class="version">v{{ version.version }}</span>
                  <span>{{ RESPONSIBILITY_LABELS[version.responsibility] }}</span>
                  <span>{{ fmtMoney(version.penalty) }}</span>
                  <span class="status small" :class="`decision-${version.status}`">{{ DECISION_STATUS_LABELS[version.status] }}</span>
                  <span class="history-note">{{ version.note || "—" }} · {{ fmtTime(version.createdAt) }}</span>
                </div>
              </div>
            </article>
          </div>

          <div class="mini-chart">
            <div v-for="row in chartRows" :key="row.state" class="bar">
              <span>{{ row.label }}</span>
              <div class="bar-track"><div class="bar-fill" :style="{ width: `${(row.value / maxChart) * 100}%` }" /></div>
              <strong>{{ row.value }}</strong>
            </div>
          </div>
        </section>
      </section>

      <section class="panel audit-panel">
        <h2>操作留档{{ search.trim() ? `（订单号含「${search.trim()}」）` : "" }}</h2>
        <div v-if="filteredAudit.length === 0" class="empty">暂无留档记录</div>
        <div v-for="entry in filteredAudit" :key="entry.id" class="audit-row">
          <span class="audit-time">{{ fmtTime(entry.at) }}</span>
          <span class="audit-code">{{ entry.orderCode }}</span>
          <span class="audit-action">{{ entry.action }}</span>
          <span class="audit-detail">{{ entry.detail }}</span>
        </div>
      </section>
    </div>
  </main>
</template>
