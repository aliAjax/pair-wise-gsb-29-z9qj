<script setup lang="ts">
import { computed, ref } from "vue";
import { useSettlementStore } from "../stores/settlement";
import { ORDER_TYPE_LABELS } from "../domain/types";
import { formatDateTime, formatMoney } from "../utils/format";
import RulingTimeline from "./RulingTimeline.vue";

const store = useSettlementStore();
const keyword = ref("");

/** 按订单号核对：精确命中优先，其次模糊匹配 */
const result = computed(() => {
  const key = keyword.value.trim().toLowerCase();
  if (!key) return null;
  return (
    store.views.find((view) => view.order.code.toLowerCase() === key) ??
    store.views.find((view) => view.order.code.toLowerCase().includes(key)) ??
    null
  );
});

const notFound = computed(() => keyword.value.trim().length > 0 && !result.value);

const confirmedSum = computed(() =>
  result.value?.activeRuling?.status === "confirmed" ? result.value.activeRuling.penalty : 0
);
const frozenSum = computed(() =>
  result.value?.activeRuling?.status === "appealing" ? result.value.activeRuling.penalty : 0
);
</script>

<template>
  <section class="panel">
    <h2>按订单核对</h2>
    <div class="form-grid">
      <label>
        订单号
        <input v-model="keyword" placeholder="输入订单号，如 SO092203" />
      </label>
    </div>

    <p v-if="notFound" class="empty">未找到该订单的留档</p>

    <div v-if="result" class="reconcile-result">
      <div class="details">
        <span>订单号：{{ result.order.code }}</span>
        <span>类型：{{ ORDER_TYPE_LABELS[result.order.type] }}</span>
        <span>订单金额：{{ formatMoney(result.order.amount) }}</span>
        <span>结算状态：{{ result.stateLabel }}</span>
        <span>承诺送达：{{ formatDateTime(result.order.promisedAt) }}</span>
        <span>实际送达：{{ formatDateTime(result.order.actualAt) }}</span>
        <span>迟到：{{ result.order.actualAt ? `${result.delayMinutes} 分钟` : "—" }}</span>
        <span>按规则核算：{{ formatMoney(result.quotedPenalty) }}</span>
        <span>实扣（已确认）：{{ formatMoney(confirmedSum) }}</span>
        <span>冻结（申诉中）：{{ formatMoney(frozenSum) }}</span>
      </div>
      <RulingTimeline v-if="result.versions.length > 0" :versions="result.versions" />
      <p v-else class="hint">该订单暂无判定记录</p>
    </div>

    <h3 class="summary-title">月度结算汇总</h3>
    <table class="summary-table">
      <thead>
        <tr>
          <th>月份</th>
          <th>订单</th>
          <th>迟到</th>
          <th>已扣款</th>
          <th>冻结中</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in store.monthlySummary" :key="row.month">
          <td>{{ row.month }}</td>
          <td>{{ row.orders }}</td>
          <td>{{ row.late }}</td>
          <td>{{ formatMoney(row.confirmed) }}</td>
          <td>{{ formatMoney(row.frozen) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
