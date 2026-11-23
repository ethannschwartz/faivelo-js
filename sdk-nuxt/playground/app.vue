<template>
  <div>
    <button @click="send">Send a test email</button>
    <pre>{{ result }}</pre>
  </div>
</template>

<script setup lang="ts">
const result = ref<unknown>(null)
async function send() {
  result.value = await $fetch('/api/welcome', { method: 'POST' })
}
</script>
