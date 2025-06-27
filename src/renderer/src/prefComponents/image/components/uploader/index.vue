<template>
  <div class="pref-image-uploader">
    <h5>Uploader</h5>
    <section class="current-uploader">
      <div v-if="isValidUploaderService(currentUploader)">
        The current image uploader is {{ getServiceNameById(currentUploader) }}.
      </div>
      <span v-else
        >Currently no uploader is selected. Please select an uploader and config it.</span
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
          Your system does not have
          <span class="link" @click="open('https://github.com/PicGo/PicGo-Core')">picgo</span>
          installed, please install it before use.
        </div>
      </div>
      <div v-if="currentUploader === 'github'" class="github">
        <div class="warning">Github will be removed in a future version, please use picgo</div>
        <div class="form-group">
          <div class="label">
            GitHub token:
            <el-tooltip
              class="item"
              effect="dark"
              content="The token is saved by Keychain on macOS, Secret Service API/libsecret on Linux and Credential Vault on Windows"
              placement="top-start"
            >
              <InfoFilled width="16" height="16" />
            </el-tooltip>
          </div>
          <el-input v-model="githubToken" placeholder="Input token" size="mini"></el-input>
        </div>
        <div class="form-group">
          <div class="label">Owner name:</div>
          <el-input v-model="github.owner" placeholder="owner" size="mini"></el-input>
        </div>
        <div class="form-group">
          <div class="label">Repo name:</div>
          <el-input v-model="github.repo" placeholder="repo" size="mini"></el-input>
        </div>
        <div class="form-group">
          <div class="label">Branch name (optional):</div>
          <el-input v-model="github.branch" placeholder="branch" size="mini"></el-input>
        </div>
        <legal-notices-checkbox
          class="github"
          :class="[{ error: legalNoticesErrorStates.github }]"
          :uploader-service="uploadServices.github"
        ></legal-notices-checkbox>
        <div class="form-group">
          <el-button size="mini" :disabled="githubDisable" @click="save('github')">Save </el-button>
        </div>
      </div>
      <div v-else-if="currentUploader === 'cliScript'" class="script">
        <div class="description">
          The script will be executed with the image file path as its only argument and it should
          output any valid value for the <code>src</code> attribute of a <em>HTMLImageElement</em>.
        </div>
        <div class="form-group">
          <div class="label">Shell script location:</div>
          <el-input v-model="cliScript" placeholder="Script absolute path" size="mini"></el-input>
        </div>
        <div class="form-group">
          <el-button size="mini" :disabled="cliScriptDisable" @click="save('cliScript')"
            >Save
          </el-button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue'
import { usePreferencesStore } from '@/store/preferences'
import services, { isValidService } from './services.js'
import legalNoticesCheckbox from './legalNoticesCheckbox.vue'
import { isFileExecutableSync } from '@/util/fileSystem'
import CurSelect from '@/prefComponents/common/select'
import commandExists from 'command-exists'
import notice from '@/services/notification'
import { storeToRefs } from 'pinia'
import { InfoFilled } from '@element-plus/icons-vue'

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
    title: 'Save Config',
    message:
      type === 'github'
        ? 'The Github configration has been saved.'
        : 'The command line script configuration has been saved',
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
