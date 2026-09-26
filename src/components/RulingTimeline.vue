<script setup lang="ts">
import { LIABLE_PARTY_LABELS, RULING_STATUS_LABELS, type Ruling } from "../domain/types";
import { formatDateTime, formatMoney } from "../utils/format";

defineProps<{ versions: Ruling[] }>();

function statusLabel(ruling: Ruling): string {
  if (ruling.status === "superseded" && ruling.supersededFrom) {
    return `已作废（原${RULING_STATUS_LABELS[ruling.supersededFrom]}）`;
  }
  return RULING_STATUS_LABELS[ruling.status];
}
</script>

<template>
  <ol class="timeline">
    <li v-for="ruling in versions" :key="ruling.id" :class="{ superseded: ruling.status === 'superseded' }">
      <div class="timeline-head">
        <strong>v{{ ruling.version }}</strong>
        <span class="pill" :class="ruling.status">{{ statusLabel(ruling) }}</span>
        <span>责任方：{{ LIABLE_PARTY_LABELS[ruling.liableParty] }}</span>
        <span>扣款 {{ formatMoney(ruling.penalty) }}</span>
        <span>迟到 {{ ruling.delayMinutes }} 分钟</span>
      </div>
      <p class="timeline-reason">{{ ruling.reason }}</p>
      <p class="timeline-meta">
        {{ ruling.ruleLabel }} · 判定 {{ formatDateTime(ruling.createdAt) }}
        <template v-if="ruling.resolvedAt"> · 确认 {{ formatDateTime(ruling.resolvedAt) }}</template>
      </p>
    </li>
  </ol>
</template>
