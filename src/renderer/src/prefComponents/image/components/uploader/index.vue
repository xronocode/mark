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
        <div v-if="!picgoExists" class="warning">
          {{ t('preferences.image.uploader.picgoNotInstalled') }}
          <span class="link" @click="open('https://github.com/PicGo/PicGo-Core')">picgo</span>
          {{ t('preferences.image.uploader.pleaseInstall') }}
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
import services, { isValidService } from './services.js'
import legalNoticesCheckbox from './legalNoticesCheckbox.vue'
import { isFileExecutableSync } from '@/util/fileSystem'
import CurSelect from '@/prefComponents/common/select'
import commandExists from 'command-exists'
import notice from '@/services/notification'
import { storeToRefs } from 'pinia'
import { InfoFilled } from '@element-plus/icons-vue'

const { t } = useI18n()

// store
const preferenceStore = usePreferencesStore()

// data
const uploaderOptions = Object.keys(services).map((name) => {
  const { name: label } = services[name]
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
const picgoExists = ref(true)
const uploadServices = services
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

    if (Object.prototype.hasOwnProperty.call(services, currentUploader.value)) {
      services[currentUploader.value].agreedToLegalNotices = true
    }
  })
})

// methods
const isValidUploaderService = (name) => {
  return isValidService(name)
}

const getServiceNameById = (id) => {
  const service = services[id]
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
  picgoExists.value = commandExists.sync('picgo')
}

const validate = (value) => {
  const service = services[value]
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

<style>
.pref-image-uploader {
  color: var(--editorColor);
  font-size: 14px;

  & .current-uploader {
    margin: 20px 0;
  }
  & .warning {
    color: var(--deleteColor);
  }
  & .link {
    color: var(--themeColor);
    cursor: pointer;
  }
  & .description {
    margin-top: 20px;
    margin-bottom: 20px;
  }
  & .form-group {
    margin: 20px 0 0 0;
  }
  & .label {
    margin-bottom: 10px;
  }
  & .el-input__inner {
    background: transparent;
  }
  & .el-button.btn-reset,
  & .button-group {
    margin-top: 30px;
  }
  & .pref-cb-legal-notices {
    &.github {
      margin-top: 30px;
    }
    &.error {
      border: 1px solid var(--deleteColor);
    }
  }
}
</style>
