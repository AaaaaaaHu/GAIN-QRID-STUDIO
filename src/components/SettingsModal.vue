<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useStudio } from '@/composables/useStudio'
import { askConfirm } from '@/composables/useConfirm'
import { compareVersion, fetchUpdateInfo } from '@/utils/update'
import {
  ACCENTS, THEME_MODES, useAppearance,
  type AccentKey, type ThemeMode
} from '@/composables/useAppearance'

const {
  settingsOpen, closeSettings,
  appVersion, dataDir, dataDirCustom, dataDirOk, isBrowserMode, usedCount, records,
  busy, copy, openDataFolder, applyDataDir, useDefaultDataDir, notify
} = useStudio()

const { appearance, resolvedTheme, systemDark, setMode, setAccent, setMotion, resetAppearance } = useAppearance()

type TabKey = 'appearance' | 'storage' | 'about' | 'product'

const tabs = [
  { key: 'appearance' as TabKey, label: '外观', desc: '主题与配色' },
  { key: 'storage' as TabKey, label: '数据存储', desc: '目录与迁移' },
  { key: 'about' as TabKey, label: '软件版本', desc: '版本与环境' },
  { key: 'product' as TabKey, label: '关于', desc: '功能与隐私' }
]

const currentAccent = computed(() => ACCENTS.find(item => item.key === appearance.value.accent) ?? ACCENTS[0])

function chooseMode(mode: ThemeMode) { setMode(mode) }
function chooseAccent(key: AccentKey) { setAccent(key) }

function onMotionChange(event: Event) {
  setMotion((event.target as HTMLInputElement).checked ? 'reduced' : 'full')
}

const features = [
  '五种关键词写法，ID 规则逐段可配',
  '全局去重库，删除记录也不复用旧 ID',
  '二维码可嵌 Logo，五个安全位置可选',
  '导出 CSV / JSON / TXT / PNG / ZIP 打包',
  '数据目录可改，支持迁移与清理'
]

const activeTab = ref<TabKey>('storage')

const draftDir = ref('')
const migrate = ref(true)
const deleteSource = ref(false)
const applying = ref(false)
const checking = ref(false)
const updateMsg = ref('')
const updateKind = ref<'ok' | 'warn' | 'err'>('ok')

async function checkUpdate() {
  if (checking.value) return
  checking.value = true
  updateMsg.value = ''
  try {
    const info = await fetchUpdateInfo()
    if (!info) {
      updateMsg.value = '当前为本地构建版本，未配置更新通道'
      updateKind.value = 'warn'
      return
    }
    if (compareVersion(info.version, appVersion.value) > 0) {
      updateMsg.value = `发现新版本 v${info.version}`
      updateKind.value = 'ok'
    } else {
      updateMsg.value = '已是最新版本'
      updateKind.value = 'ok'
    }
  } catch (e) {
    updateMsg.value = `检查失败：${String(e)}`
    updateKind.value = 'err'
  } finally {
    checking.value = false
  }
}

watch(migrate, value => {
  if (!value) deleteSource.value = false
})

watch(settingsOpen, visible => {
  if (visible) {
    draftDir.value = dataDir.value
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('keydown', onKeydown)
  }
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeSettings()
}

async function browse() {
  if (isBrowserMode.value) { notify('浏览器预览模式不支持选择目录', 'warn'); return }
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const picked = await open({ directory: true, multiple: false, title: '选择数据存放目录' })
    if (typeof picked === 'string' && picked) draftDir.value = picked
  } catch (e) {
    notify(`无法打开目录选择器：${String(e)}`, 'err')
  }
}

async function apply() {
  const target = draftDir.value.trim()
  if (!target) { notify('请填写或选择目录路径', 'warn'); return }
  if (target === dataDir.value) { notify('该目录已是当前数据目录', 'warn'); return }
  if (deleteSource.value) {
    const ok = await askConfirm({
      title: '迁移并删除原数据',
      message: '切换目录后会删除原目录中的三个数据文件，删除后无法恢复。',
      detail: `${dataDir.value}\nrecords.json / used-ids.json / config.json`,
      okText: '确认删除',
      danger: true
    })
    if (!ok) return
  }
  applying.value = true
  const done = await applyDataDir(target, migrate.value, deleteSource.value)
  applying.value = false
  if (done) draftDir.value = dataDir.value
}

async function restore() {
  const ok = await askConfirm({
    title: '恢复默认目录',
    message: deleteSource.value
      ? '把当前目录的数据复制到默认目录，并删除原目录中的三个数据文件。'
      : '把当前目录的数据复制到默认目录，原文件保留。',
    detail: dataDir.value,
    okText: deleteSource.value ? '迁移并删除' : '继续',
    danger: deleteSource.value
  })
  if (!ok) return
  applying.value = true
  await useDefaultDataDir(deleteSource.value)
  applying.value = false
  draftDir.value = dataDir.value
}

function onMaskClick(e: MouseEvent) {
  if (e.target === e.currentTarget) closeSettings()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="settingsOpen" class="mask" @click="onMaskClick">
        <div class="dialog" role="dialog" aria-modal="true" aria-label="设置">
          <header class="head">
            <div>
              <h2>设置</h2>
            </div>
            <button class="btn btn-icon close" title="关闭" @click="closeSettings">✕</button>
          </header>

          <div class="body">
            <nav class="tabs">
              <button
                v-for="tab in tabs"
                :key="tab.key"
                type="button"
                class="tab"
                :class="{ on: activeTab === tab.key }"
                @click="activeTab = tab.key"
              >
                <span class="tab-title">{{ tab.label }}</span>
                <span class="tab-desc">{{ tab.desc }}</span>
                <i v-if="tab.key === 'storage' && dataDirCustom" class="tab-dot" title="使用自定义目录" />
              </button>
            </nav>

            <div class="panes">
              <section v-if="activeTab === 'appearance'" class="pane">
                <div class="pane-head">
                  <span>主题模式</span>
                  <span class="tag-current">{{ resolvedTheme === 'dark' ? '当前深色' : '当前浅色' }}</span>
                </div>

                <div class="mode-grid">
                  <button
                    v-for="mode in THEME_MODES"
                    :key="mode.key"
                    type="button"
                    class="mode-card"
                    :class="{ on: appearance.mode === mode.key }"
                    :aria-pressed="appearance.mode === mode.key"
                    @click="chooseMode(mode.key)"
                  >
                    <span class="mode-preview" :class="'pv-' + mode.key">
                      <i class="pv-bar" /><i class="pv-side" /><i class="pv-block" />
                    </span>
                    <span class="mode-name">{{ mode.label }}</span>
                    <span class="mode-desc">{{ mode.desc }}</span>
                    <span v-if="appearance.mode === mode.key" class="mode-tick">✓</span>
                  </button>
                </div>

                <p v-if="appearance.mode === 'system'" class="note">
                  系统当前为{{ systemDark ? '深色' : '浅色' }}模式，切换系统主题时应用会自动跟随。
                </p>

                <div class="pane-head gap-head">
                  <span>主题配色</span>
                  <span class="tag-current">{{ currentAccent.label }}</span>
                </div>

                <div class="accent-grid">
                  <button
                    v-for="accent in ACCENTS"
                    :key="accent.key"
                    type="button"
                    class="accent-card"
                    :class="{ on: appearance.accent === accent.key }"
                    :aria-pressed="appearance.accent === accent.key"
                    @click="chooseAccent(accent.key)"
                  >
                    <span class="accent-dot" :style="{ background: accent.color }" />
                    <span class="accent-text">
                      <b>{{ accent.label }}</b>
                      <small>{{ accent.desc }}</small>
                    </span>
                    <span v-if="appearance.accent === accent.key" class="accent-tick">✓</span>
                  </button>
                </div>

                <label class="checkbox-row motion-row">
                  <input
                    type="checkbox"
                    :checked="appearance.motion === 'reduced'"
                    @change="onMotionChange"
                  />
                  减少界面动效（关闭过渡与动画）
                </label>

                <div class="pane-head gap-head">
                  <span>实时预览</span>
                  <span class="tag-current">切换后立即生效</span>
                </div>

                <div class="theme-preview">
                  <div class="tp-bar">
                    <span class="tp-logo" />
                    <span class="tp-title">GIAN-QRID-STUDIO</span>
                    <span class="tp-pill">本地已存 12 条</span>
                  </div>
                  <div class="tp-body">
                    <div class="tp-side">
                      <span class="tp-line w70" /><span class="tp-line w90" />
                      <span class="tp-field" /><span class="tp-field" />
                      <span class="tp-primary">生成 ID</span>
                    </div>
                    <div class="tp-main">
                      <div class="tp-card">
                        <span class="tp-qr">▦</span>
                        <div class="tp-card-lines">
                          <span class="tp-line w60" /><span class="tp-line w85" />
                        </div>
                      </div>
                      <div class="tp-table">
                        <span v-for="n in 3" :key="n" class="tp-row" />
                      </div>
                    </div>
                  </div>
                </div>

                <div class="actions appearance-actions">
                  <button class="btn btn-sm" @click="resetAppearance">恢复默认外观</button>
                  <span class="saved-hint">自动保存在本机，重启后仍保留</span>
                </div>

                <p class="note">
                  外观只影响界面显示，不改变二维码颜色、已生成的 ID 或导出文件内容。
                  「跟随系统」读取 Windows 深色模式设置。
                </p>
              </section>

              <section v-else-if="activeTab === 'about'" class="pane">
                <div class="ver-block">
                  <span class="ver mono">v{{ appVersion }}</span>
                  <span class="ver-tag">{{ isBrowserMode ? '浏览器预览模式' : '桌面客户端' }}</span>
                </div>
                <p class="about-text">本地构建版本。配置更新通道后可在此比对线上最新版本。</p>

                <div class="update-row">
                  <button class="btn btn-sm" :disabled="checking" @click="checkUpdate">
                    {{ checking ? '检查中…' : '检查更新' }}
                  </button>
                  <span v-if="updateMsg" class="update-msg" :class="updateKind">{{ updateMsg }}</span>
                </div>
              </section>

              <section v-else-if="activeTab === 'product'" class="pane">
                <div class="brand-row">
                  <div class="brand-logo" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                      <rect x="3" y="3" width="7" height="7" rx="1.6" stroke="#fff" stroke-width="1.8" />
                      <rect x="14" y="3" width="7" height="7" rx="1.6" stroke="#fff" stroke-width="1.8" />
                      <rect x="3" y="14" width="7" height="7" rx="1.6" stroke="#fff" stroke-width="1.8" />
                      <path d="M14 14h3v3h-3zM18 18h3v3h-3z" fill="#fff" />
                    </svg>
                  </div>
                  <div class="brand-info">
                    <h4>GIAN-QRID-STUDIO</h4>
                    <p>本地优先的批量 ID 与二维码工具</p>
                  </div>
                </div>

                <p class="about-text">
                  面向物料标签、资产编号这类场景：按关键词批量生成永不重复的 ID，同步产出可扫描的二维码。
                </p>

                <ul class="feature-list">
                  <li v-for="feature in features" :key="feature">
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span>{{ feature }}</span>
                  </li>
                </ul>

                <div class="about-block">
                  <h5>数据与隐私</h5>
                  <p>不联网、不上传、无账号。ID、二维码与规则配置只写入你指定的目录，退出或卸载都不会删除这些文件。</p>
                </div>
 
                <div class="about-block">
                  <h5>版权与联系</h5>
                  <p>版权所有 © 2026 GIAN</p>
                  <p class="contact-line">
                    <span>联系邮箱</span>
                    <code class="mono">17608117215@163.com</code>
                    <button class="btn btn-sm" @click="copy('17608117215@163.com')">复制</button>
                  </p>
                </div>
              </section>

              <section v-else class="pane">
                <div class="pane-head">
                  <span>当前目录</span>
                  <span v-if="dataDirCustom" class="tag-custom">自定义</span>
                </div>

                <div class="path-box">
                  <code class="mono">{{ dataDir || '浏览器 localStorage' }}</code>
                  <div class="path-actions">
                    <button class="btn btn-sm" @click="copy(dataDir)">复制</button>
                    <button class="btn btn-sm" :disabled="isBrowserMode" @click="openDataFolder()">打开</button>
                  </div>
                </div>

                <p v-if="!dataDirOk" class="note err">
                  目录当前不可访问（可能被移动、重命名，或所在磁盘未连接）。数据仍保存在原处，恢复磁盘后可继续读取。
                </p>

                <p class="note">
                  该目录下保存 <code>records.json</code>（生成记录）、<code>used-ids.json</code>（去重库）、
                  <code>config.json</code>（规则配置）。当前已生成 {{ records.length }} 条记录，去重库累计
                  {{ usedCount }} 个唯一 ID。开启删除时只移除这三个文件，不影响目录内其他内容。
                </p>

                <template v-if="!isBrowserMode">
                  <div class="field">
                    <label for="dir">更改为</label>
                    <div class="dir-row">
                      <input
                        id="dir"
                        v-model="draftDir"
                        class="input mono"
                        type="text"
                        placeholder="例如 D:\ID数据 或点击浏览"
                      />
                      <button class="btn btn-sm" @click="browse">浏览…</button>
                    </div>
                  </div>

                  <label class="checkbox-row migrate">
                    <input v-model="migrate" type="checkbox" />
                    把现有数据复制到新目录
                  </label>

                  <label class="checkbox-row migrate danger-row" :class="{ off: !migrate, on: deleteSource }">
                    <input v-model="deleteSource" type="checkbox" :disabled="!migrate" />
                    迁移成功后删除原目录中的三个数据文件（不可恢复）
                  </label>

                  <div class="actions">
                    <button
                      class="btn btn-sm"
                      :disabled="busy || applying"
                      title="把当前目录的数据复制到默认目录"
                      @click="restore"
                    >恢复默认目录</button>
                    <button class="btn btn-primary btn-sm apply" :disabled="busy || applying" @click="apply">
                      {{ applying ? '处理中…' : '应用新目录' }}
                    </button>
                  </div>
                </template>

                <p v-else class="note warn">
                  浏览器预览模式的数据存在 localStorage；要用自定义目录请运行桌面版（<code>pnpm tauri:dev</code>）。
                </p>
              </section>
            </div>
          </div>

          <footer class="foot">
            <span>{{ activeTab === 'appearance'
              ? '外观设置即时生效，自动保存在本机'
              : activeTab === 'storage'
                ? '修改目录后立即生效，无需重启'
                : activeTab === 'about'
                  ? '版本信息读取自应用清单'
                  : '数据全部保存在本地，不上传云端' }}</span>
            <!-- <button class="btn btn-sm" @click="closeSettings">完成</button> -->
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--mask);
  backdrop-filter: blur(2px);
}

.dialog {
  width: 680px;
  max-width: 100%;
  max-height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface);
  border-radius: 16px;
  box-shadow: var(--dialog-shadow);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--border);

  h2 { margin: 0; font-size: 15px; font-weight: 700; }
  .sub { margin: 2px 0 0; font-size: 11px; color: var(--ink-3); }
}

.close { color: var(--ink-3); }

.body {
  flex: 0 0 auto;
  height: 462px;
  max-height: calc(100vh - 156px);
  display: grid;
  grid-template-columns: 154px minmax(0, 1fr);
  overflow: hidden;
}

.tabs {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 12px 10px;
  background: var(--surface-soft);
  border-right: 1px solid var(--border);
}

.tab {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 9px 11px;
  border: none;
  border-radius: 9px;
  background: none;
  text-align: left;
  transition: all .15s;

  .tab-title { font-size: 12px; font-weight: 600; color: var(--ink-2); }
  .tab-desc { font-size: 10px; color: var(--ink-3); }

  &:hover { background: var(--tab-hover); }

  &.on {
    background: var(--surface-raised);
    box-shadow: var(--shadow-raised);

    .tab-title { color: var(--brand); font-weight: 700; }
    .tab-desc { color: var(--tab-desc-on); }
  }
}

.tab-dot {
  position: absolute;
  top: 12px;
  right: 11px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--warn);
}

.panes {
  min-width: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-soft) transparent;

  &::-webkit-scrollbar { width: 8px; }
  &::-webkit-scrollbar-thumb {
    border-radius: 3px;
    background: var(--scrollbar-soft);

    &:hover { background: var(--scrollbar-hover); }
  }
  &::-webkit-scrollbar-track { background: transparent; }
}

.pane {
  padding: 18px 20px 20px;
  min-height: 100%;
}

.pane-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-2);
}

.version {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.ver {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: .2px;
  color: var(--ink);
}

.ver-block {
  display: flex;
  align-items: baseline;
  gap: 9px;
}

.ver-tag {
  padding: 2px 8px;
  border-radius: 20px;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  font-size: 10.5px;
  color: var(--ink-3);
}

.update-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
}

.update-msg {
  font-size: 11px;
  line-height: 1.5;

  &.ok { color: var(--ok); }
  &.warn { color: var(--warn); }
  &.err { color: var(--err); }
}

.env {
  font-size: 11.5px;
  color: var(--ink-3);
}

.stack {
  margin: 3px 0 0;
  font-size: 11px;
  color: var(--ink-3);
}

.about-text {
  margin: 11px 0 0;
  font-size: 11.5px;
  line-height: 1.75;
  color: var(--ink-2);
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 11px;
}

.brand-logo {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: var(--brand-gradient);
  box-shadow: 0 6px 16px var(--brand-shadow);
}

.brand-info {
  min-width: 0;

  h4 { margin: 0; font-size: 13px; font-weight: 700; color: var(--ink); }
  p { margin: 2px 0 0; font-size: 10.5px; color: var(--ink-3); }
}

.feature-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 11px 0 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    font-size: 11.5px;
    line-height: 1.55;
    color: var(--ink-2);
  }

  svg {
    flex: 0 0 auto;
    margin-top: 3px;
    color: var(--ok);
  }
}

.about-block {
  margin-top: 11px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-strong);

  h5 {
    margin: 0 0 5px;
    font-size: 11px;
    font-weight: 700;
    color: var(--ink-2);
  }

  p {
    margin: 0;
    font-size: 11px;
    line-height: 1.75;
    color: var(--ink-3);
  }
}

.contact-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;

  code {
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--surface-code);
    font-size: 10.5px;
    color: var(--ink-2);
  }

  .btn { height: 24px; padding: 0 8px; font-size: 10.5px; }
}

.facts {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin: 14px 0 0;
  padding-top: 13px;
  border-top: 1px dashed var(--border-strong);

  > div {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }

  dt {
    flex: 0 0 84px;
    font-size: 11px;
    color: var(--ink-3);
  }

  dd {
    margin: 0;
    font-size: 11.5px;
    color: var(--ink);
    word-break: break-all;
  }
}

.tag-custom {
  padding: 1px 7px;
  border-radius: 20px;
  background: var(--tag-warn-bg);
  color: var(--tag-warn-ink);
  font-size: 10px;
  font-weight: 700;
}

.path-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  background: var(--surface-soft);

  code {
    flex: 1;
    min-width: 0;
    font-size: 11px;
    color: var(--ink-2);
    word-break: break-all;
    line-height: 1.45;
  }
}

.path-actions { display: flex; gap: 5px; flex: 0 0 auto; }

.note {
  margin: 9px 0 12px;
  font-size: 10.5px;
  line-height: 1.65;
  color: var(--ink-3);

  code {
    padding: 1px 4px;
    border-radius: 4px;
    background: var(--surface-code);
    font-size: 10px;
  }

  &.warn { margin-bottom: 0; color: var(--warn); }
  &.err { margin-bottom: 0; color: var(--err); font-weight: 600; }
}

.dir-row { display: flex; gap: 6px; }

.migrate { margin: 10px 0 12px; font-size: 11.5px; }

.danger-row {
  margin-top: -4px;

  &.off { opacity: .45; }
  &.on { color: var(--err); font-weight: 600; }
}

.actions { display: flex; justify-content: space-between; gap: 8px; }
.apply { min-width: 108px; }

.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 20px;
  background: var(--surface-soft);

  span { font-size: 10.5px; color: var(--ink-3); }
}

/* ---- 外观页 ---- */
.tag-current {
  padding: 1px 7px;
  border-radius: 20px;
  background: var(--brand-soft);
  color: var(--brand);
  font-size: 10px;
  font-weight: 700;
}

.gap-head { margin-top: 16px; }

.mode-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.mode-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 8px 9px 9px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--surface);
  text-align: left;
  transition: all .15s;

  &:hover { border-color: var(--brand); }
  &.on { border-color: var(--brand); background: var(--brand-soft); box-shadow: 0 0 0 2px var(--brand-ring); }
}

/* 预览缩略图用固定色，是为了如实展示浅/深主题本身，不随当前主题变化 */
.mode-preview {
  position: relative;
  display: block;
  width: 100%;
  height: 42px;
  margin-bottom: 5px;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--pv-bg);

  .pv-bar { position: absolute; top: 0; left: 0; right: 0; height: 9px; background: var(--pv-bar); }
  .pv-side { position: absolute; top: 12px; left: 5px; bottom: 5px; width: 26%; border-radius: 2px; background: var(--pv-surface); }
  .pv-block {
    position: absolute; top: 12px; left: 35%; right: 5px; bottom: 5px;
    border-radius: 2px; background: var(--pv-surface);
    box-shadow: inset 0 3px 0 var(--pv-accent);
  }
}

.pv-light { --pv-bg: #f3f6fc; --pv-bar: #e4e9f3; --pv-surface: #ffffff; --pv-accent: #4f46e5; }
.pv-dark { --pv-bg: #0b1120; --pv-bar: #28334c; --pv-surface: #151d30; --pv-accent: #818cf8; }
.pv-system {
  --pv-bg: linear-gradient(90deg, #f3f6fc 0 50%, #0b1120 50% 100%);
  --pv-bar: #d3dbeb; --pv-surface: #ffffff; --pv-accent: #4f46e5;
}

.mode-name { font-size: 11px; font-weight: 700; color: var(--ink); }
.mode-desc { font-size: 9.5px; color: var(--ink-3); }
.mode-tick { position: absolute; top: 5px; right: 7px; font-size: 11px; font-weight: 700; color: var(--brand); }

.accent-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.accent-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  padding: 7px 8px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  background: var(--surface);
  text-align: left;
  transition: all .15s;

  &:hover { border-color: var(--brand); }
  &.on { border-color: var(--brand); background: var(--brand-soft); }
}

.accent-dot {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .1);
}

.accent-text {
  display: flex;
  flex-direction: column;
  min-width: 0;

  b { font-size: 11px; font-weight: 700; color: var(--ink); }
  small { font-size: 9.5px; color: var(--ink-3); }
}

.accent-tick { position: absolute; top: 2px; right: 6px; font-size: 10px; font-weight: 700; color: var(--brand); }

.motion-row { margin: 12px 0 0; font-size: 11.5px; }

.theme-preview {
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg);
}

.tp-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--header-bg);
  border-bottom: 1px solid var(--border);
}

.tp-logo { width: 12px; height: 12px; border-radius: 3px; background: var(--brand-gradient); }
.tp-title { font-size: 9px; font-weight: 700; color: var(--ink); }
.tp-pill {
  margin-left: auto;
  padding: 1px 6px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-soft);
  font-size: 8px;
  color: var(--ink-2);
}

.tp-body { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 6px; padding: 7px; }
.tp-side, .tp-main { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.tp-line { display: block; height: 5px; border-radius: 3px; background: var(--border-strong); opacity: .7; }
.w60 { width: 60%; }
.w70 { width: 70%; }
.w85 { width: 85%; }
.w90 { width: 90%; }

.tp-field { height: 14px; border: 1px solid var(--border-strong); border-radius: 4px; background: var(--surface); }
.tp-primary { height: 16px; border-radius: 4px; background: var(--brand-gradient);font-size: 10px; padding: 0 4px; color: var(--on-brand);}

.tp-card {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
}

.tp-qr {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-checker);
  color: var(--brand);
  font-size: 16px;
}

.tp-card-lines { flex: 1; display: flex; flex-direction: column; gap: 5px; min-width: 0; }

.tp-table {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 5px 7px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
}

.tp-row { height: 5px; border-bottom: 1px solid var(--border-row); }

.appearance-actions { margin-top: 12px; align-items: center; }
.saved-hint { font-size: 10px; color: var(--ink-3); }

.modal-enter-active, .modal-leave-active { transition: opacity .18s ease; }
.modal-enter-active .dialog, .modal-leave-active .dialog { transition: transform .18s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .dialog, .modal-leave-to .dialog { transform: translateY(10px) scale(.98); }
</style>
