<template>
  <div class="pref-image-uploader">
    <h5>{{ t('preferences.image.uploader.title') }}</h5>
    <section class="current-uploader">
      <div v-if="isValidUploaderService(currentUploader)">
        {{ t('preferences.image.uploader.currentUploader', { name: getServiceNameById(currentUploader) }) }}
      </div>
      <span v-else
        >{{ t('preferences.image.uploader.noUploaderSelected') }}</span
      >
    </section>
    <section class="configration">
      <cur-select
        :value="currentUploader"
        :options="uploaderOptions"
        :on-change="(value) => setCurrentUploader(value)"
      ></cur-select>
      <div v-if="currentUploader === 'picgo'" class="picgo">
        <div class="detection-status">
          <h6>{{ t('preferences.image.uploader.picgoDetectionStatus') }}</h6>
          <div :class="['status-info', picgoExists ? 'success' : 'warning']">
            {{ picgoDetectionStatus || t('preferences.image.uploader.picgoNotInstalled') }}
          </div>
          <div v-if="!picgoExists" class="install-commands">
            <div class="install-title">{{ t('preferences.image.uploader.chooseInstallMethod') }}</div>
            <div class="install-options">
              <div class="install-option">
                <strong>npm:</strong>
                <code class="install-command">{{ t('preferences.image.uploader.npmInstallCommand') }}</code>
              </div>
              <div class="install-option">
                <strong>yarn:</strong>
                <code class="install-command">{{ t('preferences.image.uploader.yarnInstallCommand') }}</code>
              </div>
              <div class="install-option">
                <strong>pnpm:</strong>
                <code class="install-command">{{ t('preferences.image.uploader.pnpmInstallCommand') }}</code>
              </div>
            </div>
            <div class="install-link">
              <span class="link" @click="open('https://github.com/PicGo/PicGo-Core')">picgo</span>
              {{ t('preferences.image.uploader.pleaseInstall') }}
            </div>
          </div>
          <details v-if="picgoDetectionFailed && picgoDebugInfo" class="debug-info">
            <summary>{{ t('preferences.image.uploader.debugInfo') }}</summary>
            <pre>{{ picgoDebugInfo || '暂无调试信息' }}</pre>
          </details>
        </div>
      </div>
      <div v-if="currentUploader === 'github'" class="github">
        <div class="warning">{{ t('preferences.image.uploader.githubDeprecated') }}</div>
        <div class="form-group">
          <div class="label">
            {{ t('preferences.image.uploader.githubToken') }}:
            <el-tooltip
              class="item"
              effect="dark"
              :content="t('preferences.image.uploader.tokenTooltip')"
              placement="top-start"
            >
              <InfoFilled width="16" height="16" />
            </el-tooltip>
          </div>
          <el-input v-model="githubToken" :placeholder="t('preferences.image.uploader.inputToken')" size="mini"></el-input>
        </div>
        <div class="form-group">
          <div class="label">{{ t('preferences.image.uploader.ownerName') }}:</div>
          <el-input v-model="github.owner" :placeholder="t('preferences.image.uploader.owner')" size="mini"></el-input>
        </div>
        <div class="form-group">
          <div class="label">{{ t('preferences.image.uploader.repoName') }}:</div>
          <el-input v-model="github.repo" :placeholder="t('preferences.image.uploader.repo')" size="mini"></el-input>
        </div>
        <div class="form-group">
          <div class="label">{{ t('preferences.image.uploader.branchName') }}:</div>
          <el-input v-model="github.branch" :placeholder="t('preferences.image.uploader.branch')" size="mini"></el-input>
        </div>
        <legal-notices-checkbox
          class="github"
          :class="[{ error: legalNoticesErrorStates.github }]"
          :uploader-service="uploadServices.github"
        ></legal-notices-checkbox>
        <div class="form-group">
          <el-button size="mini" :disabled="githubDisable" @click="save('github')">{{ t('preferences.image.uploader.save') }}</el-button>
        </div>
      </div>
      <div v-else-if="currentUploader === 'cliScript'" class="script">
        <div class="description">
          {{ t('preferences.image.uploader.scriptDescription') }}
        </div>
        <div class="form-group">
          <div class="label">{{ t('preferences.image.uploader.scriptLocation') }}:</div>
          <el-input v-model="cliScript" :placeholder="t('preferences.image.uploader.scriptPath')" size="mini"></el-input>
        </div>
        <div class="form-group">
          <el-button size="mini" :disabled="cliScriptDisable" @click="save('cliScript')"
            >{{ t('preferences.image.uploader.save') }}
          </el-button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePreferencesStore } from '@/store/preferences'
import getServices, { isValidService } from './services.js'
import legalNoticesCheckbox from './legalNoticesCheckbox.vue'
import { isFileExecutableSync } from '@/util/fileSystem'
import CurSelect from '@/prefComponents/common/select'
import notice from '@/services/notification'
import { storeToRefs } from 'pinia'
import { InfoFilled } from '@element-plus/icons-vue'

const { t } = useI18n()

// store
const preferenceStore = usePreferencesStore()

// data
const uploaderOptions = Object.keys(getServices()).map((name) => {
    const { name: label } = getServices()[name]
  return {
    label,
    value: name
  }
})
const githubToken = ref('')
const github = reactive({
  owner: '',
  repo: '',
  branch: ''
})
const cliScript = ref('')
const picgoExists = ref(false)
const picgoDetectionFailed = ref(false) // 检测是否失败
const picgoDetectionStatus = ref('') // 检测状态文本
const picgoDebugInfo = ref('') // 调试信息
const uploadServices = getServices()
const legalNoticesErrorStates = reactive({
  github: false
})

// computed
const { currentUploader, imageBed, prefGithubToken, prefCliScript } = storeToRefs(preferenceStore)

const githubDisable = computed(() => !githubToken.value || !github.owner || !github.repo)
const cliScriptDisable = computed(() => {
  if (!cliScript.value) {
    return true
  }
  return !isFileExecutableSync(cliScript.value)
})

// watch
watch(imageBed, (value, oldValue) => {
  if (JSON.stringify(value) !== JSON.stringify(oldValue)) {
    Object.assign(github, value.github)
  }
})

// lifecycle
onMounted(() => {
  nextTick(() => {
    if (imageBed.value.github) {
      Object.assign(github, imageBed.value.github)
    }
    githubToken.value = prefGithubToken.value
    cliScript.value = prefCliScript.value
    testPicgo()

    if (Object.prototype.hasOwnProperty.call(getServices(), currentUploader.value)) {
      getServices()[currentUploader.value].agreedToLegalNotices = true
    }
  })
})

// methods
const isValidUploaderService = (name) => {
  return isValidService(name)
}

const getServiceNameById = (id) => {
  const service = getServices()[id]
  return service ? service.name : id
}

const open = (link) => {
  window.electron.shell.openExternal(link)
}

const save = (type) => {
  if (!validate(type)) {
    return
  }

  const newImageBedConfig = { ...imageBed.value }
  if (type === 'github') {
    newImageBedConfig.github = { ...github }
  } else if (type === 'cliScript') {
    newImageBedConfig.cliScript = cliScript.value
  }

  preferenceStore.SET_USER_DATA({
    type: 'imageBed',
    value: newImageBedConfig
  })
  if (type === 'github') {
    preferenceStore.SET_USER_DATA({
      type: 'githubToken',
      value: githubToken.value
    })
  }
  if (type === 'cliScript') {
    preferenceStore.SET_USER_DATA({
      type: 'cliScript',
      value: cliScript.value
    })
  }
  notice.notify({
    title: t('preferences.image.uploader.saveConfig'),
    message:
      type === 'github'
        ? t('preferences.image.uploader.githubConfigSaved')
        : t('preferences.image.uploader.scriptConfigSaved'),
    type: 'primary'
  })
}

const setCurrentUploader = (value) => {
  const type = 'currentUploader'
  preferenceStore.SET_USER_DATA({ type, value })
}

const testPicgo = () => {
  console.log('=== PicGo 检测开始 ===')
  console.log('window.commandExists:', window.commandExists)
  
  let debugMessages = []
  
  if (typeof window.commandExists === 'undefined') {
    const errorMsg = 'commandExists 未暴露到 window 对象'
    console.error('✗', errorMsg)
    debugMessages.push(`✗ ${errorMsg}`)
    picgoExists.value = false
    picgoDetectionFailed.value = true
    picgoDetectionStatus.value = t('preferences.image.uploader.picgoDetectionFailed')
    picgoDebugInfo.value = debugMessages.join('\n')
    return
  }
  
  debugMessages.push('✓ commandExists 已暴露到 window 对象')
  
  if (typeof window.commandExists.exists !== 'function') {
    const errorMsg = 'commandExists.exists 方法不可用'
    const availableKeys = Object.keys(window.commandExists).join(', ')
    console.error('✗', errorMsg)
    console.log('commandExists 对象内容:', availableKeys)
    debugMessages.push(`✗ ${errorMsg}`)
    debugMessages.push(`可用方法: ${availableKeys}`)
    picgoExists.value = false
    picgoDetectionStatus.value = t('preferences.image.uploader.picgoDetectionFailed')
    picgoDebugInfo.value = debugMessages.join('\n')
    return
  }
  
  debugMessages.push('✓ commandExists.exists 方法可用')
  
  try {
    console.log('正在检测 PicGo...')
    debugMessages.push('正在检测 PicGo 命令...')
    const result = window.commandExists.exists('picgo')
    console.log('PicGo 检测结果:', result)
    picgoExists.value = result
    
    if (result) {
      debugMessages.push('✓ PicGo 命令检测成功')
      picgoDetectionFailed.value = false
      picgoDetectionStatus.value = t('preferences.image.uploader.picgoInstalled')
    } else {
      debugMessages.push('✗ PicGo 命令未找到 - 确认PicGo未安装')
      picgoDetectionFailed.value = false  // 检测成功，只是PicGo未安装
      picgoDetectionStatus.value = t('preferences.image.uploader.picgoNotInstalled')
    }
  } catch (error) {
    console.error('PicGo 检测失败:', error)
    debugMessages.push(`✗ 检测异常: ${error.message}`)
    picgoExists.value = false
    picgoDetectionFailed.value = true
    picgoDetectionStatus.value = t('preferences.image.uploader.picgoDetectionFailed')
  }
  
  picgoDebugInfo.value = debugMessages.join('\n')
  console.log('=== PicGo 检测结束 ===')
}

const validate = (value) => {
  const service = getServices()[value]
  if (!service) return true
  const { agreedToLegalNotices } = service
  if (agreedToLegalNotices === false) {
    legalNoticesErrorStates[value] = true
    return false
  }
  if (legalNoticesErrorStates[value] !== undefined) {
    legalNoticesErrorStates[value] = false
  }

  return true
}
</script>

<style scoped>
.pref-image-uploader {
  color: var(--editorColor);
  font-size: 14px;
}

.pref-image-uploader .current-uploader {
  margin: 20px 0;
}

.pref-image-uploader .warning {
  color: var(--deleteColor);
}

.pref-image-uploader .link {
  color: var(--themeColor);
  cursor: pointer;
}

.pref-image-uploader .detection-status {
  margin: 15px 0;
  padding: 15px;
  border: 1px solid var(--editorColor30);
  border-radius: 6px;
  background: var(--floatBgColor);
}

.pref-image-uploader .detection-status h6 {
  margin: 0 0 10px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--editorColor);
}

.pref-image-uploader .status-info {
  padding: 8px 12px;
  border-radius: 4px;
  margin-bottom: 10px;
  font-weight: 500;
}

.pref-image-uploader .status-info.success {
  background: var(--successBgColor, #f0f9ff);
  color: var(--successColor, #059669);
  border: 1px solid var(--successColor, #059669);
}

.pref-image-uploader .status-info.warning {
  background: var(--warningBgColor, #fffbeb);
  color: var(--warningColor, #d97706);
  border: 1px solid var(--warningColor, #d97706);
}

.pref-image-uploader .install-commands {
  margin-top: 12px;
  padding: 12px;
  background-color: #f8f9fa;
  border-radius: 6px;
  border-left: 4px solid #ffc107;
}

.pref-image-uploader .install-title {
  font-weight: 600;
  margin-bottom: 8px;
  color: #333;
  font-size: 13px;
}

.pref-image-uploader .install-options {
  margin-bottom: 12px;
}

.pref-image-uploader .install-option {
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.pref-image-uploader .install-option strong {
  min-width: 50px;
  font-size: 12px;
  color: #666;
}

.pref-image-uploader .install-command {
  background-color: #e9ecef;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 11px;
  color: #495057;
  border: 1px solid #dee2e6;
  user-select: all;
}

.pref-image-uploader .install-link {
  margin: 10px 0;
  font-size: 13px;
}

.pref-image-uploader .debug-info {
  margin-top: 15px;
}

.pref-image-uploader .debug-info summary {
  cursor: pointer;
  font-size: 13px;
  color: var(--editorColor70);
  margin-bottom: 8px;
}

.pref-image-uploader .debug-info pre {
  background: var(--codeBgColor, #f8f9fa);
  border: 1px solid var(--editorColor20);
  border-radius: 4px;
  padding: 10px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--editorColor);
  white-space: pre-wrap;
  word-wrap: break-word;
  max-height: 200px;
  overflow-y: auto;
}

.pref-image-uploader .description {
  margin-top: 20px;
  margin-bottom: 20px;
}

.pref-image-uploader .form-group {
  margin: 20px 0 0 0;
}

.pref-image-uploader .label {
  margin-bottom: 10px;
}

.pref-image-uploader .el-input__inner {
  background: transparent;
}

.pref-image-uploader .el-button.btn-reset,
.pref-image-uploader .button-group {
  margin-top: 30px;
}

.pref-image-uploader .pref-cb-legal-notices.github {
  margin-top: 30px;
}

.pref-image-uploader .pref-cb-legal-notices.error {
  border: 1px solid var(--deleteColor);
}
</style>
