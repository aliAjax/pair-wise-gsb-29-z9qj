<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import {
  SETTLEMENT_STATE_LABELS,
  useSettlementStore,
  type SettlementState,
  type SettlementView,
} from "../stores/settlement";
import {
  LIABLE_PARTY_LABELS,
  ORDER_TYPE_LABELS,
  RULING_STATUS_LABELS,
  type LiableParty,
  type OrderType,
} from "../domain/types";
import { formatDateTime, formatMoney } from "../utils/format";
import RulingTimeline from "./RulingTimeline.vue";

const store = useSettlementStore();

const STATE_TONES: Record<SettlementState, string> = {
  delivering: "muted",
  onTime: "ok",
  unruled: "warn",
  pending: "info",
  appealing: "danger",
  deducted: "dark",
  cleared: "ok",
};

const stateFilter = ref<"all" | SettlementState>("all");
const typeFilter = ref<"all" | OrderType>("all");

const filteredViews = computed(() =>
  store.views.filter(
    (view) =>
      (stateFilter.value === "all" || view.state === stateFilter.value) &&
      (typeFilter.value === "all" || view.order.type === typeFilter.value)
  )
);

// 内联定责/改判表单
const editing = ref<{ mode: "create" | "rejudge"; orderId: string; rulingId?: string } | null>(null);
const rulingForm = reactive<{ liableParty: LiableParty; reason: string }>({
  liableParty: "rider",
  reason: "",
});

function openCreate(orderId: string) {
  editing.value = { mode: "create", orderId };
  rulingForm.liableParty = "rider";
  rulingForm.reason = "";
}

function openRejudge(orderId: string, rulingId: string) {
  editing.value = { mode: "rejudge", orderId, rulingId };
  rulingForm.liableParty = "rider";
  rulingForm.reason = "改判：";
}

function submitRuling() {
  if (!editing.value || !rulingForm.reason.trim()) return;
  if (editing.value.mode === "create") {
    store.createRuling(editing.value.orderId, rulingForm.liableParty, rulingForm.reason.trim());
  } else if (editing.value.rulingId) {
    store.rejudgeRuling(editing.value.rulingId, rulingForm.liableParty, rulingForm.reason.trim());
  }
  editing.value = null;
}

// 版本历史展开
const expanded = ref<Set<string>>(new Set());
function toggleVersions(orderId: string) {
  const next = new Set(expanded.value);
  if (next.has(orderId)) next.delete(orderId);
  else next.add(orderId);
  expanded.value = next;
}

function confirmText(view: SettlementView): string {
  const penalty = view.activeRuling?.penalty ?? 0;
  return penalty > 0 ? `确认扣款 ${formatMoney(penalty)}` : "确认定责（免扣）";
}
</script>

<template>
  <section class="list-panel">
    <div class="toolbar">
      <h2>时效结算台</h2>
      <div class="filters">
        <select v-model="stateFilter">
          <option value="all">全部状态</option>
          <option v-for="(label, state) in SETTLEMENT_STATE_LABELS" :key="state" :value="state">
            {{ label }}
          </option>
        </select>
        <select v-model="typeFilter">
          <option value="all">全部类型</option>
          <option v-for="(label, type) in ORDER_TYPE_LABELS" :key="type" :value="type">
            {{ label }}
          </option>
        </select>
      </div>
    </div>

    <div class="record-grid">
      <div v-if="filteredViews.length === 0" class="empty">暂无匹配订单</div>

      <article v-for="view in filteredViews" :key="view.order.id" class="record">
        <div class="record-head">
          <p class="record-title">
            {{ view.order.code }} · {{ formatMoney(view.order.amount) }}
            <span class="type-tag">{{ ORDER_TYPE_LABELS[view.order.type] }}</span>
          </p>
          <span class="pill" :class="STATE_TONES[view.state]">{{ view.stateLabel }}</span>
        </div>

        <div class="details">
          <span>承诺送达：{{ formatDateTime(view.order.promisedAt) }}</span>
          <span>实际送达：{{ formatDateTime(view.order.actualAt) }}</span>
          <span>迟到：{{ view.order.actualAt ? `${view.delayMinutes} 分钟` : "—" }}</span>
          <span>按规则核算：{{ formatMoney(view.quotedPenalty) }}</span>
          <span>延迟原因：{{ view.order.delayReason }}</span>
          <span>骑手：{{ view.order.rider }}</span>
          <span class="span-2">地址：{{ view.order.address }}</span>
        </div>

        <div v-if="view.activeRuling" class="ruling-box">
          <strong>当前判定 v{{ view.activeRuling.version }}</strong>
          <span>责任方：{{ LIABLE_PARTY_LABELS[view.activeRuling.liableParty] }}</span>
          <span>扣款 {{ formatMoney(view.activeRuling.penalty) }}</span>
          <span class="pill small" :class="view.activeRuling.status">
            {{ RULING_STATUS_LABELS[view.activeRuling.status] }}
          </span>
          <p>{{ view.activeRuling.reason }}</p>
        </div>

        <div class="actions">
          <button
            v-if="view.state === 'delivering'"
            type="button"
            @click="store.markDelivered(view.order.id)"
          >
            登记送达
          </button>
          <button v-if="view.state === 'unruled'" type="button" @click="openCreate(view.order.id)">
            提交定责
          </button>
          <template v-if="view.activeRuling">
            <button
              v-if="view.activeRuling.status === 'pending'"
              type="button"
              @click="store.confirmRuling(view.activeRuling.id)"
            >
              {{ confirmText(view) }}
            </button>
            <button
              v-if="view.activeRuling.status === 'pending' || view.activeRuling.status === 'confirmed'"
              class="secondary"
              type="button"
              @click="store.appealRuling(view.activeRuling.id)"
            >
              申诉（冻结）
            </button>
            <button
              v-if="view.activeRuling.status === 'appealing'"
              class="secondary"
              type="button"
              @click="store.upholdRuling(view.activeRuling.id)"
            >
              维持原判
            </button>
            <button
              class="secondary"
              type="button"
              @click="openRejudge(view.order.id, view.activeRuling.id)"
            >
              改判
            </button>
          </template>
          <button
            v-if="view.versions.length > 0"
            class="secondary"
            type="button"
            @click="toggleVersions(view.order.id)"
          >
            判定记录（{{ view.versions.length }}）
          </button>
          <button class="danger" type="button" @click="store.removeOrder(view.order.id)">删除</button>
        </div>

        <form
          v-if="editing && editing.orderId === view.order.id"
          class="ruling-form"
          @submit.prevent="submitRuling"
        >
          <strong>{{ editing.mode === "create" ? "提交定责" : "改判（生成新版本，旧决定留档）" }}</strong>
          <label>
            责任方
            <select v-model="rulingForm.liableParty">
              <option v-for="(label, party) in LIABLE_PARTY_LABELS" :key="party" :value="party">
                {{ label }}
              </option>
            </select>
          </label>
          <p class="hint">客户 / 不可抗力为免责，扣款记 0；骑手、商家/仓库按规则扣款。</p>
          <label>
            定责说明（留档可查）
            <input v-model="rulingForm.reason" placeholder="如：复核为仓库备货延误" required />
          </label>
          <div class="actions">
            <button type="submit">提交</button>
            <button class="secondary" type="button" @click="editing = null">取消</button>
          </div>
        </form>

        <RulingTimeline v-if="expanded.has(view.order.id)" :versions="view.versions" />
      </article>
    </div>
  </section>
</template>
