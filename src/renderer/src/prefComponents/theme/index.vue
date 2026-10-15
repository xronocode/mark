<template>
  <div class="pref-theme">
    <h4>{{ t('preferences.theme.title') }}</h4>
    <section class="offcial-themes">
      <!--
        C-41 T-002: one tile per family — light and dark swatches side by
        side, family name below, selected outline on the family owning the
        applied theme. Picking a family sets both mode members and applies
        the member for the current mode; unlike the retired per-theme
        cards it never leaves Auto (the point of a family is Auto
        switching within it).
      -->
      <div
        v-for="f of familyTiles"
        :key="f.id"
        class="theme-family"
        :class="{ active: f.id === activeFamilyId }"
        @click="onSelectFamily(f)"
      >
        <div class="family-swatches">
          <div class="theme swatch" :class="f.light"><div v-html="f.lightHtml"></div></div>
          <div class="theme swatch" :class="f.dark"><div v-html="f.darkHtml"></div></div>
        </div>
        <div class="family-name">{{ f.name }}</div>
      </div>
    </section>
    <separator></separator>

    <!--
      C-41 T-001: followSystemTheme and the light/dark member choices are
      visible again (they mirror the title-bar Auto/Light/Dark button
      state). Full redesign lands with C-38 N3.
    -->
    <Bool
      :description="t('preferences.theme.followSystemTheme')"
      :bool="followSystemTheme"
      :on-change="(value) => onSelectChange('followSystemTheme', value)"
    />

    <compound v-if="followSystemTheme">
      <template #head>
        <h6 class="title">{{ t('preferences.theme.modeThemes') }}</h6>
      </template>
      <template #children>
        <cur-select
          :description="t('preferences.theme.lightModeTheme')"
          :value="lightModeTheme"
          :options="themeOptions"
          :on-change="(value) => onSelectChange('lightModeTheme', value)"
        ></cur-select>

        <cur-select
          :description="t('preferences.theme.darkModeTheme')"
          :value="darkModeTheme"
          :options="themeOptions"
          :on-change="(value) => onSelectChange('darkModeTheme', value)"
        ></cur-select>
      </template>
    </compound>

    <div>
      <div style="font-size: smaller; color: var(--editorColor)">{{ t('preferences.theme.customCss') }}</div>
      <textarea
        style="
          width: 100%;
          background: transparent;
          color: var(--editorColor);
          border: 1px solid var(--editorColor10);
        "
        rows="10"
        :value="customCss"
        @change="(event) => onSelectChange('customCss', event.target.value)"
      ></textarea>
    </div>
    <separator v-show="false"></separator>
    <section v-show="false" class="import-themes ag-underdevelop">
      <div>
        <span>{{ t('preferences.theme.openThemesFolder') }}</span>
        <el-button size="small">{{ t('preferences.theme.openFolder') }}</el-button>
      </div>

      <div>
        <span>{{ t('preferences.theme.importCustomThemes') }}</span>
        <el-button size="small">{{ t('preferences.theme.importTheme') }}</el-button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { usePreferencesStore } from '@/store/preferences'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import themeMd from './theme.md?raw'
import { families as configFamilies, themes as configThemes } from './config'
import { themeFamilyOf } from '@/util/themeFamilies'
import { familyMemberForMode } from '@/util/autoTheme'
import markdownToHtml from '@/util/markdownToHtml'
import Bool from '../common/bool'
import CurSelect from '../common/select'
import Separator from '../common/separator'
import Compound from '../common/compound'

const familyTiles = ref([])

const { t } = useI18n()
const preferenceStore = usePreferencesStore()

const { followSystemTheme, lightModeTheme, darkModeTheme, theme, customCss } = storeToRefs(preferenceStore)

// Generate dropdown options from configThemes
const themeOptions = configThemes.map(theme => ({
  label: theme.name.split('-').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' '),
  value: theme.name
}))

// The tile selected is the family owning the currently applied theme.
const activeFamilyId = computed(() => {
  const family = themeFamilyOf(theme.value)
  return family ? family.id : null
})

onMounted(async () => {
  const tiles = []
  for (const family of configFamilies) {
    const lightHtml = await markdownToHtml(themeMd.replace(/{theme}/, family.light))
    const darkHtml = await markdownToHtml(themeMd.replace(/{theme}/, family.dark))
    tiles.push({
      id: family.id,
      name: family.name,
      light: family.light,
      dark: family.dark,
      lightHtml,
      darkHtml
    })
  }
  familyTiles.value = tiles
})

const onSelectChange = (type, value) => {
  preferenceStore.SET_SINGLE_PREFERENCE({ type, value })
}

// START_BLOCK_SELECT_THEME_CARD
// C-41 T-002: picking a family sets both mode members and applies the
// member for the current mode (Auto: system appearance; Light/Dark: that
// member — the same mode semantics as the title-bar cycle). The members
// persist BEFORE `theme` so the SET_USER_PREFERENCE full-snapshot echo
// and the app.vue Auto watcher resolve against the new family, and —
// unlike the retired per-theme cards — followSystemTheme is never
// flipped: Auto keeps switching within the chosen family.
const onSelectFamily = (family) => {
  const mode = followSystemTheme.value
    ? 'auto'
    : (themeFamilyOf(theme.value)?.dark === theme.value ? 'dark' : 'light')
  onSelectChange('lightModeTheme', family.light)
  onSelectChange('darkModeTheme', family.dark)
  onSelectChange('theme', familyMemberForMode(family, mode))
}
// END_BLOCK_SELECT_THEME_CARD
</script>

<style>
.offcial-themes {
  margin-top: 12px;
  & .theme-family {
    cursor: pointer;
    width: 248px;
    margin: 0px 20px 10px 0px;
    display: inline-block;
    vertical-align: top;
    box-sizing: border-box;
    border-radius: 5px;
    transition: opacity 0.2s ease;

    &.active {
      box-shadow: var(--floatShadow);
      outline: 2px solid var(--themeColor);
      outline-offset: 2px;
    }
  }
  & .family-swatches {
    display: flex;
    width: 248px;
    border-radius: 5px;
    overflow: hidden;
    box-shadow: 0 9px 28px -9px rgba(0, 0, 0, 0.4);
  }
  /* C-41 T-002: swatch base — light half defaults; every kept theme
     overrides below. */
  & .theme.swatch {
    flex: 1 1 50%;
    height: 88px;
    padding: 12px 12px;
    overflow: hidden;
    box-sizing: border-box;
    color: rgba(0, 0, 0, 0.7);
    background: rgba(255, 255, 255, 1);
    & a {
      color: rgba(33, 181, 111, 1);
    }
  }

  /* C-41 T-001: brand themes — Paper (light default) and Ink (dark
     default) swatches use the same values as the themes. */
  & .theme.swatch.paper {
    color: rgba(34, 37, 43, 0.7);
    background: #FBF8F2;
    & a {
      color: #9A6F00;
    }
  }
  & .theme.swatch.ink {
    color: rgba(236, 230, 218, 0.7);
    background: #17191E;
    & a {
      color: #FFCF1A;
    }
  }

  & .theme.swatch.graphite {
    color: rgba(43, 48, 50, 0.7);
    background: #f7f7f7;
    & a {
      color: rgb(104, 134, 170);
    }
  }
  & .theme.swatch.one-dark {
    color: #9da5b4;
    background: #282c34;
    & a {
      color: rgba(226, 192, 141, 1);
    }
  }
  & .theme.swatch.ulysses {
    color: rgba(101, 101, 101, 0.7);
    background: #f3f3f3;
    & a {
      color: rgb(12, 139, 186);
    }
  }

  /* C-41 T-003 members (values from their theme files). */
  & .theme.swatch.one-light { color: #383a42; background: #fafafa; & a { color: #2f5fc4; } }
  & .theme.swatch.alucard { color: #1f1f1f; background: #fffbeb; & a { color: #644ac9; } }
  & .theme.swatch.nord-light { color: #2e3440; background: #eceff4; & a { color: #476387; } }
  & .theme.swatch.kanagawa-lotus { color: #545464; background: #f2ecbc; & a { color: #4d699b; } }
  & .theme.swatch.graphite-dark { color: #c9ced2; background: #2b3032; & a { color: #8fa9c9; } }
  & .theme.swatch.ulysses-dark { color: #d6d6d6; background: #212529; & a { color: #2ea8e0; } }

  /* Kept gogh themes - Dark */
  & .theme.swatch.dracula {
    color: #f8f8f2;
    background: #282a36;
    & a { color: #bd93f9; }
  }
  & .theme.swatch.nord {
    color: #d8dee9;
    background: #2e3440;
    & a { color: #81a1c1; }
  }
  & .theme.swatch.catppuccin-mocha {
    color: #cdd6f4;
    background: #1e1e2e;
    & a { color: #89b4fa; }
  }
  & .theme.swatch.gruvbox-dark {
    color: #ebdbb2;
    background: #282828;
    & a { color: #83a598; }
  }
  & .theme.swatch.tokyo-night {
    color: #c0caf5;
    background: #1a1b26;
    & a { color: #7aa2f7; }
  }
  & .theme.swatch.solarized-dark {
    color: #839496;
    background: #002b36;
    & a { color: #268bd2; }
  }
  & .theme.swatch.ayu-dark {
    color: #b3b1ad;
    background: #0a0e14;
    & a { color: #39bae6; }
  }
  & .theme.swatch.everforest-dark {
    color: #d3c6aa;
    background: #2d353b;
    & a { color: #a7c080; }
  }
  & .theme.swatch.rose-pine {
    color: #e0def4;
    background: #191724;
    & a { color: #c4a7e7; }
  }
  & .theme.swatch.kanagawa {
    color: #dcd7ba;
    background: #1f1f28;
    & a { color: #7e9cd8; }
  }

  /* Kept gogh themes - Light */
  & .theme.swatch.catppuccin-latte {
    color: #4c4f69;
    background: #eff1f5;
    & a { color: #1e66f5; }
  }
  & .theme.swatch.gruvbox-light {
    color: #3c3836;
    background: #fbf1c7;
    & a { color: #458588; }
  }
  & .theme.swatch.tokyo-night-light {
    color: #343b58;
    background: #d5d6db;
    & a { color: #34548a; }
  }
  & .theme.swatch.solarized-light {
    color: #657b83;
    background: #fdf6e3;
    & a { color: #268bd2; }
  }
  & .theme.swatch.ayu-light {
    color: #575f66;
    background: #fafafa;
    & a { color: #399ee6; }
  }
  & .theme.swatch.everforest-light {
    color: #5c6a72;
    background: #fdf6e3;
    & a { color: #8da101; }
  }
  & .theme.swatch.rose-pine-dawn {
    color: #575279;
    background: #faf4ed;
    & a { color: #907aa9; }
  }

  & .family-name {
    margin-top: 6px;
    padding-left: 2px;
    font-size: 12px;
    color: var(--editorColor);
  }

  & h3 {
    margin: 0;
    font-size: 16px;
    color: currentColor;
    cursor: pointer;
    &::before {
      content: 'h3';
      position: absolute;
      top: 4px;
      left: -20px;
      display: block;
      width: 10px;
      height: 10px;
      font-size: 12px;
      opacity: 0.5;
    }
  }
  & p {
    font-size: 12px;
  }
}

.import-themes {
  padding: 10px 0;
  display: flex;
  justify-content: space-around;
  color: var(--editorColor);
  & > div {
    display: flex;
    flex-direction: column;
    & > span {
      display: inline-block;
      margin-bottom: 20px;
    }
  }
}
</style>
