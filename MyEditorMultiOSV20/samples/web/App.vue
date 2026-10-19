<template>
  <div class="counter">
    <button @click="count--">−</button>
    <span>{{ count }}</span>
    <button @click="count++">+</button>
  </div>
</template>

<script setup>
import { ref } from 'vue';
const count = ref(0);
</script>

<style scoped>
.counter { display: inline-flex; gap: 8px; align-items: center; }
</style>
