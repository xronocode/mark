<template>
  <div class="pref-cb-legal-notices">
    <!-- eslint-disable-next-line vue/no-mutating-props -->
    <el-checkbox v-model="uploaderService.agreedToLegalNotices"></el-checkbox>
    <span>
      By using {{ uploaderService.name }}, you agree to {{ uploaderService.name }}'s
      <span class="link" @click="openUrl(uploaderService.privacyUrl)">Privacy Statement</span>
      and
      <span class="link" @click="openUrl(uploaderService.tosUrl)">Terms of Service</span>.
      <span v-if="!uploaderService.isGdprCompliant"
        >This service cannot be used in Europe due to GDPR issues.</span
      >
    </span>
  </div>
</template>

<script setup>
defineProps({
  uploaderService: Object
})

const openUrl = (link) => {
  if (link) {
    window.electron.shell.openExternal(link)
  }
}
</script>

<style>
.pref-cb-legal-notices {
  border: 1px solid transparent;
  padding: 3px 5px;
  & .el-checkbox {
    margin-right: 0;
  }
}
</style>
