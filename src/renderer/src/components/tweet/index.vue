<template>
  <div class="tweet-dialog">
    <el-dialog
      v-model="showTweetDialog"
      :show-close="false"
      :modal="true"
      custom-class="ag-dialog-table"
      width="450px"
    >
      <template #title>
        <div class="title">
          <span>{{ t('tweet.title') }}</span>
        </div>
      </template>
      <div class="body">
        <div class="feeling">
          <div>{{ t('tweet.feelingsQuestion') }}</div>
          <ul>
            <li :class="{ active: selectedFace === 'smile' }" @click="faceClick('smile')">
              <chrome-icon name="smile" :size="25" aria-hidden="true" />
            </li>
            <li :class="{ active: selectedFace === 'sad' }" @click="faceClick('sad')">
              <chrome-icon name="sad" :size="25" aria-hidden="true" />
            </li>
          </ul>
        </div>
        <div class="feedback">
          <div>{{ t('tweet.feedbackQuestion') }}</div>
          <textarea ref="textarea" v-model="value" cols="30" rows="10"></textarea>
        </div>
        <div class="buttons">
          <a href="javascript:;" class="github" @click="reportViaGithub">
            <chrome-icon name="github" :size="22" aria-hidden="true" />
            {{ t('tweet.reportViaGithub') }}
          </a>
          <a
            href="javascript:;"
            class="twitter"
            :class="{ active: value }"
            @click="reportViaTwitter"
          >
            <chrome-icon name="twitter" :size="22" aria-hidden="true" />
            {{ t('tweet.tweet') }}
          </a>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
// START_CHANGE_SUMMARY
//   - 2026-10-15 C-38 T-006 N4 b/d: the face pickers and the two brand
//     links render from the drawn chromeIcons set (monochrome currentColor
//     transcriptions) instead of the iconfont sprite; the Tweet action
//     and the dialog banner follow the system accent.
// END_CHANGE_SUMMARY
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import bus from '../../bus'
import { useI18n } from 'vue-i18n'
import { ChromeIcon } from '../icons/chromeIcons.js'

const { t } = useI18n()

const showTweetDialog = ref(false)
const value = ref('')
const selectedFace = ref('smile')
const textarea = ref(null)

const showDialog = () => {
  showTweetDialog.value = true
  value.value = ''
  bus.emit('editor-blur')
  nextTick(() => {
    if (textarea.value) {
      textarea.value.focus()
    }
  })
}

onMounted(() => {
  bus.on('tweetDialog', showDialog)
})

onBeforeUnmount(() => {
  bus.off('tweetDialog', showDialog)
})

const faceClick = (name) => {
  selectedFace.value = name
}

const reportViaGithub = () => {
  window.electron.shell.openExternal('https://github.com/xronocode/mark/issues/new')
}

const reportViaTwitter = () => {
  if (!value.value) return
  const origin = 'https://twitter.com/intent/tweet'

  const params = {
    via: 'marktextme',
    url: encodeURI('https://github.com/xronocode/mark/'),
    text: value.value
  }

  if (selectedFace.value === 'smile') {
    params.hashtags = 'markEditor'
  }

  window.electron.shell.openExternal(
    `${origin}?${Object.keys(params)
      .map((key) => `${key}=${params[key]}`)
      .join('&')}`
  )
  showTweetDialog.value = false
}
</script>

<style>
.tweet-dialog {
  color: var(--sideBarColor);
  & .title {
    font-size: 24px;
  }
  & .el-dialog__header {
    border-top-left-radius: 5px;
    border-top-right-radius: 5px;
  }
  & .el-dialog__body {
    color: var(--sideBarColor);
  }
}
.tweet-dialog .feeling,
.tweet-dialog .feedback {
  font-size: 16px;
}
.tweet-dialog .feeling {
  & ul {
    display: flex;
    list-style: none;
    margin: 0;
    padding: 0;
    height: 45px;
    & li {
      display: flex;
      align-items: center;
      margin-right: 15px;
      cursor: pointer;
    }
  }
  & li > svg {
    transition: color 0.25s ease-in-out;
    width: 25px;
    height: 25px;
  }
  & li:hover > svg,
  & li.active > svg {
    color: rgb(255, 204, 0);
  }
}
.tweet-dialog .feedback {
  & > textarea {
    width: 100%;
    box-sizing: border-box;
    margin: 15px 0;
    padding: 0.5rem;
    resize: none;
    outline: none;
    border: 1px solid var(--floatBorderColor);
    background: var(--floatBorderColor);
    color: var(--editorColor);
    border-radius: 5px;
    font-size: 14px;
    height: 80px;
  }
}
.tweet-dialog .buttons {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.tweet-dialog .buttons a.twitter {
  color: var(--chromeAccent);
  text-decoration: none;
  width: auto;
  height: 30px;
  line-height: 30px;
  padding: 0 8px;
  border-radius: 2px;
  box-sizing: border-box;
  display: inline-block;
  background: #eee;
  cursor: not-allowed;
}
.tweet-dialog .buttons a.active {
  background: var(--chromeAccent);
  color: #fff;
}
.tweet-dialog .buttons a.active {
  cursor: pointer;
}
.tweet-dialog .buttons a.github {
  color: var(--iconColor);
  text-decoration: none;
  &:hover {
    color: var(--chromeAccent);
  }
  & > svg {
    width: 1.4rem;
    height: 1.4rem;
    vertical-align: bottom;
  }
}
.tweet-dialog .el-dialog__header {
  background: var(--chromeAccent);
  color: #fff;
}
</style>
