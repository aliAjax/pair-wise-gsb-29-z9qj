<script setup lang="ts">
import { reactive } from "vue";
import { useSettlementStore } from "../stores/settlement";
import { DELAY_REASONS, ORDER_TYPE_LABELS, RIDERS, type OrderType } from "../domain/types";

const store = useSettlementStore();

const blank = () => ({
  code: "",
  type: "normal" as OrderType,
  amount: 100,
  rider: RIDERS[0] as string,
  address: "",
  promisedAt: "",
  actualAt: "",
  delayReason: DELAY_REASONS[0] as string,
});

const form = reactive(blank());

function submit() {
  store.addOrder({
    code: form.code.trim() || store.suggestOrderCode(),
    type: form.type,
    amount: Number(form.amount) || 0,
    rider: form.rider,
    address: form.address.trim() || "未填地址",
    promisedAt: form.promisedAt,
    actualAt: form.actualAt || null,
    delayReason: form.delayReason,
  });
  Object.assign(form, blank());
}
</script>

<template>
  <form class="panel" @submit.prevent="submit">
    <h2>登记订单</h2>
    <div class="form-grid">
      <label>
        订单号（留空自动生成）
        <input v-model="form.code" placeholder="如 SO092601" />
      </label>
      <label>
        订单类型
        <select v-model="form.type">
          <option v-for="(label, value) in ORDER_TYPE_LABELS" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
      </label>
      <label>
        订单金额（元）
        <input v-model="form.amount" type="number" min="0.01" step="0.01" required />
      </label>
      <label>
        骑手
        <select v-model="form.rider">
          <option v-for="rider in RIDERS" :key="rider">{{ rider }}</option>
        </select>
      </label>
      <label>
        地址
        <input v-model="form.address" placeholder="送达地址" required />
      </label>
      <label>
        承诺送达
        <input v-model="form.promisedAt" type="datetime-local" required />
      </label>
      <label>
        实际送达（未送达留空）
        <input v-model="form.actualAt" type="datetime-local" />
      </label>
      <label>
        延迟原因
        <select v-model="form.delayReason">
          <option v-for="reason in DELAY_REASONS" :key="reason">{{ reason }}</option>
        </select>
      </label>
      <button type="submit">加入结算台</button>
    </div>
  </form>
</template>
