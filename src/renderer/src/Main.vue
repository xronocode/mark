<script setup>
import { useRoute } from 'vue-router'
const route = useRoute()
</script>

<template>
  <div id="app">
    <!-- This router-view will render either App component (/editor) or Preference component (/preference) -->
    <router-view />
  </div>
</template>
