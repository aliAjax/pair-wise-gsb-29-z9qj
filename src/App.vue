<script setup lang="ts">
import { useSettlementStore } from "./stores/settlement";
import { PENALTY_RULES } from "./domain/rules";
import { formatMoney } from "./utils/format";
import OrderEntryForm from "./components/OrderEntryForm.vue";
import SettlementBoard from "./components/SettlementBoard.vue";
import ReconcilePanel from "./components/ReconcilePanel.vue";

const store = useSettlementStore();
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">物流行业 · 月底时效结算</p>
          <h1>时效结算台</h1>
          <p class="subtitle">
            每单记录订单金额、承诺与实际送达、延迟原因；定责确认后才扣款，申诉未结先冻结，改判生成新版本、旧决定留档可查。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue3</span>
          <span class="tag">TypeScript</span>
          <span class="tag">规则 / 留档 / 页面分离</span>
        </div>
      </header>

      <section class="metrics">
        <article class="metric">
          <span>订单总数</span>
          <strong>{{ store.totals.orders }}</strong>
        </article>
        <article class="metric">
          <span>迟到单</span>
          <strong>{{ store.totals.late }}</strong>
        </article>
        <article class="metric">
          <span>已确认扣款</span>
          <strong>{{ formatMoney(store.totals.confirmed) }}</strong>
        </article>
        <article class="metric">
          <span>申诉冻结</span>
          <strong>{{ formatMoney(store.totals.frozen) }}</strong>
        </article>
      </section>

      <section class="rule-strip">
        <span v-for="rule in PENALTY_RULES" :key="rule.label" class="tag">{{ rule.label }}</span>
      </section>

      <section class="workspace">
        <div class="side">
          <OrderEntryForm />
          <ReconcilePanel />
        </div>
        <SettlementBoard />
      </section>
    </div>
  </main>
</template>
