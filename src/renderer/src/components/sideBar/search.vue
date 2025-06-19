<template>
  <div class="side-bar-search">
    <div class="search-wrapper">
      <input
        ref="searchEl"
        v-model="keyword"
        type="text"
        placeholder="Search in folder..."
        @keyup="search"
      />
      <div class="controls">
        <span
          title="Case Sensitive"
          class="is-case-sensitive"
          :class="{ active: isCaseSensitive }"
          @click.stop="caseSensitiveClicked()"
        >
          <svg :viewBox="FindCaseIcon.viewBox" aria-hidden="true">
            <use :xlink:href="FindCaseIcon.url" />
          </svg>
        </span>
        <span
          title="Select whole word"
          class="is-whole-word"
          :class="{ active: isWholeWord }"
          @click.stop="wholeWordClicked()"
        >
          <svg :viewBox="FindWordIcon.viewBox" aria-hidden="true">
            <use :xlink:href="FindWordIcon.url" />
          </svg>
        </span>
        <span
          title="Use query as RegEx"
          class="is-regex"
          :class="{ active: isRegexp }"
          @click.stop="regexpClicked()"
        >
          <svg :viewBox="FindRegexIcon.viewBox" aria-hidden="true">
            <use :xlink:href="FindRegexIcon.url" />
          </svg>
        </span>
      </div>
    </div>

    <div v-if="showNoFolderOpenedMessage" class="search-message-section">
      <span>No folder open</span>
    </div>
    <div v-if="showNoResultFoundMessage" class="search-message-section">No results found.</div>
    <div v-if="searchErrorString" class="search-message-section">{{ searchErrorString }}</div>

    <div v-show="showSearchCancelArea" class="cancel-area">
      <el-button type="primary" size="mini" @click="cancelSearcher">
        Cancel <i class="el-icon-video-pause"></i>
      </el-button>
    </div>
    <div v-if="searchResult.length" class="search-result-info">{{ searchResultInfo }}</div>
    <div v-if="searchResult.length" class="search-result">
      <search-result-item
        v-for="(item, index) of searchResult"
        :key="index"
        :search-result="item"
      ></search-result-item>
    </div>
    <div v-else class="empty">
      <div class="no-data">
        <button v-if="showNoFolderOpenedMessage" class="button-primary" @click="openFolder">
          Open Folder
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useLayoutStore } from '@/store/layout'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { storeToRefs } from 'pinia'
import bus from '../../bus'
import log from 'electron-log'
import SearchResultItem from './searchResultItem.vue'
import RipgrepDirectorySearcher from '../../node/ripgrepSearcher'
import FindCaseIcon from '@/assets/icons/searchIcons/iconCase.svg'
import FindWordIcon from '@/assets/icons/searchIcons/iconWord.svg'
import FindRegexIcon from '@/assets/icons/searchIcons/iconRegex.svg'

const layoutStore = useLayoutStore()
const projectStore = useProjectStore()
const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

let searcherCancelCallback = null
const ripgrepDirectorySearcher = new RipgrepDirectorySearcher()

const keyword = ref('')
const searchResult = ref([])
const searcherRunning = ref(false)
const showSearchCancelArea = ref(false)
const searchErrorString = ref('')
const isCaseSensitive = ref(false)
const isWholeWord = ref(false)
const isRegexp = ref(false)
const searchEl = ref(null)

const { rightColumn, showSideBar } = storeToRefs(layoutStore)
const { currentFile } = storeToRefs(editorStore)
const { projectTree } = storeToRefs(projectStore)
const {
  searchExclusions,
  searchMaxFileSize,
  searchIncludeHidden,
  searchNoIgnore,
  searchFollowSymlinks
} = storeToRefs(preferencesStore)

const searchMatches = computed(() => currentFile.value?.searchMatches)

const searchResultInfo = computed(() => {
  const fileCount = searchResult.value.length
  const matchCount = searchResult.value.reduce((acc, item) => {
    return acc + item.matches.length
  }, 0)

  return `${matchCount} ${matchCount > 1 ? 'matches' : 'match'} in ${fileCount} ${fileCount > 1 ? 'files' : 'file'}`
})

const showNoFolderOpenedMessage = computed(() => {
  return !projectTree.value || !projectTree.value.pathname
})

const showNoResultFoundMessage = computed(() => {
  return (
    searchResult.value.length === 0 && searcherRunning.value === false && keyword.value.length > 0
  )
})

const search = () => {
  // No root directory is opened.
  if (showNoFolderOpenedMessage.value) {
    return
  }

  const { pathname: rootDirectoryPath } = projectTree.value

  if (searcherRunning.value && searcherCancelCallback) {
    searcherCancelCallback()
  }

  searchErrorString.value = ''
  searcherCancelCallback = null

  if (!keyword.value) {
    searchResult.value = []
    searcherRunning.value = false
    return
  }

  let canceled = false
  searcherRunning.value = true
  startShowSearchCancelAreaTimer()

  const newSearchResult = []
  const promises = ripgrepDirectorySearcher
    .search([rootDirectoryPath], keyword.value, {
      didMatch: (res) => {
        if (canceled) return
        newSearchResult.push(res)
      },
      didSearchPaths: (numPathsFound) => {
        // More than 100 files with (multiple) matches were found.
        if (!canceled && numPathsFound > 100) {
          canceled = true
          if (promises.cancel) {
            promises.cancel()
          }
          searchErrorString.value = 'Search was limited to 100 files.'
        }
      },

      // UI options
      isCaseSensitive: isCaseSensitive.value,
      isWholeWord: isWholeWord.value,
      isRegexp: isRegexp.value,

      // Options loaded from settings
      exclusions: searchExclusions.value,
      maxFileSize: searchMaxFileSize.value || null,
      includeHidden: searchIncludeHidden.value,
      noIgnore: searchNoIgnore.value,
      followSymlinks: searchFollowSymlinks.value,

      // Only search markdown files
      inclusions: window.fileUtils.MARKDOWN_INCLUSIONS
    })
    .then(() => {
      searchResult.value = newSearchResult
      searcherRunning.value = false
      searcherCancelCallback = null
      stopShowSearchCancelAreaTimer()
    })
    .catch((err) => {
      canceled = true
      if (promises.cancel) {
        promises.cancel()
      }
      log.error('Error while searching in directory:', err)
      searchResult.value = []
      searcherRunning.value = false
      searcherCancelCallback = null
      stopShowSearchCancelAreaTimer()
    })

  if (promises.cancel) {
    searcherCancelCallback = promises.cancel
  }
}

const handleFindInFolder = (executeSearch = true) => {
  nextTick(() => {
    if (searchEl.value) {
      searchEl.value.focus()
      const { selectedText } = searchMatches.value
      if (selectedText) {
        keyword.value = selectedText
        if (executeSearch) {
          search()
        }
      }
    }
  })
}

const openFolder = () => {
  projectStore.ASK_FOR_OPEN_PROJECT()
}

const caseSensitiveClicked = () => {
  isCaseSensitive.value = !isCaseSensitive.value
  search()
}

const wholeWordClicked = () => {
  isWholeWord.value = !isWholeWord.value
  search()
}

const regexpClicked = () => {
  isRegexp.value = !isRegexp.value
  search()
}

let searchCancelTimer = null
const startShowSearchCancelAreaTimer = () => {
  if (searchCancelTimer) {
    clearTimeout(searchCancelTimer)
    searchCancelTimer = null
  }
  searchCancelTimer = setTimeout(() => {
    showSearchCancelArea.value = true
  }, 500)
}

const stopShowSearchCancelAreaTimer = () => {
  if (searchCancelTimer) {
    clearTimeout(searchCancelTimer)
    searchCancelTimer = null
  }
  showSearchCancelArea.value = false
}

const cancelSearcher = () => {
  if (searcherRunning.value && searcherCancelCallback) {
    searcherCancelCallback()
  }
}

watch(showSideBar, (value, oldValue) => {
  if (rightColumn.value === 'search') {
    if (value && !oldValue) {
      handleFindInFolder(false)
    } else {
      bus.emit('search-blur')
    }
  }
})

onMounted(() => {
  handleFindInFolder()
  bus.on('findInFolder', handleFindInFolder)
  if (keyword.value.length > 0 && searcherRunning.value === false) {
    searcherRunning.value = true
    search()
  }
})
</script>

<style scoped>
.side-bar-search {
  padding: 15px;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.search-wrapper {
  margin-bottom: 15px;
  position: relative;
}

.search-wrapper > input {
  width: 100%;
  height: 28px;
  line-height: 28px;
  border-radius: 3px;
  padding: 0 85px 0 10px;
  box-sizing: border-box;
  background: transparent;
  border: 1px solid var(--sideBarSearchBorderColor);
  color: var(--sideBarColor);
  outline: none;
}
.search-wrapper > input:focus {
  border-color: var(--themeColor);
}

.search-wrapper .controls {
  position: absolute;
  top: 0;
  right: 1px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--sideBarBgColor);
  padding: 0 10px;
}
.search-wrapper .controls span {
  display: inline-block;
  width: 20px;
  height: 20px;
  margin: 0 3px;
  border-radius: 3px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  & > svg {
    width: 12px;
    height: 12px;
    fill: var(--iconColor);
  }
}
.search-wrapper .controls span.active {
  background-color: var(--themeColor);
  & > svg {
    fill: #fff;
  }
}

.cancel-area {
  margin-bottom: 15px;
}

.search-result-info {
  margin-bottom: 15px;
}

.search-result {
  flex: 1;
  overflow-y: auto;
}
.search-result::-webkit-scrollbar {
  width: 5px;
}

.search-message-section {
  margin-bottom: 15px;
}

.empty {
  font-size: 14px;
  text-align: center;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
}

.no-data {
  text-align: center;
  color: var(--sideBarColor);
}
</style>
