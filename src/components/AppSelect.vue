<script setup lang="ts" generic="T extends string | number">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

type Option = {
  value: T
  label: string
  /** 右侧灰色附注，如行政区划代码 */
  hint?: string
  /** 缩进层级，0 为顶层 */
  depth?: number
  /** 额外的搜索关键词（拼音、简称等） */
  keywords?: string
  /** 搜索结果中的所属层级说明，如区县所属的省市 */
  note?: string
  /** 顶层分组项，样式加粗以便区分层级 */
  group?: boolean
  /** 常用项优先级，数值越小越靠前；未设置按 999 处理 */
  hot?: number
  /** 上级选项的 value（顶层留空），开启 cascade 后用于分栏联动 */
  parent?: string
}

const props = withDefaults(defineProps<{
  modelValue: T
  options: Option[]
  disabled?: boolean
  placeholder?: string
  /** 透传到触发按钮，便于外部定位 */
  id?: string
  /** 面板顶部显示搜索框 */
  searchable?: boolean
  searchPlaceholder?: string
  /** 搜索结果最多渲染条数 */
  resultLimit?: number
  /** 面板最小宽度（px），默认与触发按钮同宽 */
  panelWidth?: number
  /** 无关键词时隐藏该层级及更深的选项（如区县），只展示上级 */
  collapseDepth?: number
  /** 折叠层级时底部的提示文案 */
  collapseHint?: string
  /**
   * 分栏联动：无关键词时只列顶层选项，悬停某列后向右追加其子级，
   * 最多三列（省 / 市 / 区县），避免一次性平铺几千条。
   * 输入关键词后仍退化为平铺搜索结果。
   */
  cascade?: boolean
  /** 分栏模式每列宽度 */
  columnWidth?: number
  /** 无匹配项时的提示 */
  emptyText?: string
  /** sm = 28px 高，用于工具栏；md = 34px，用于表单 */
  size?: 'sm' | 'md'
}>(), {
  searchable: false,
  searchPlaceholder: '搜索',
  resultLimit: 200,
  collapseHint: '输入关键词可搜索下级选项',
  cascade: false,
  columnWidth: 158,
  emptyText: '没有匹配项'
})

const emit = defineEmits<{ 'update:modelValue': [T] }>()

const open = ref(false)
const query = ref('')
const triggerEl = ref<HTMLButtonElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)
const searchEl = ref<HTMLInputElement | null>(null)
const activeIndex = ref(-1)
/** 触发按钮的视口坐标，面板定位依赖它，随分栏数量变化重算 */
const anchor = ref({ left: 0, top: 0, bottom: 0, width: 0 })
const dropUp = ref(false)
const listMax = ref(228)
/** 分栏模式下已展开的路径（各列停留项的 value） */
const hoverChain = ref<string[]>([])

const currentLabel = computed(
  () => props.options.find(o => o.value === props.modelValue)?.label ?? props.placeholder ?? '请选择'
)

/** 过滤后的全部匹配项（未截断） */
const matched = computed<Option[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.options

  const scored: Array<{ option: Option; score: number }> = []
  for (const option of props.options) {
    const label = option.label.toLowerCase()
    let score = -1
    if (label === q) score = 0
    else if (label.startsWith(q)) score = 1
    else if (option.hint?.startsWith(q)) score = 2
    else if (label.includes(q)) score = 3
    else if (option.hint?.includes(q)) score = 4
    // keywords 以空格分隔多个词（全拼、首字母），按词首匹配，输入 sz / shenzhen 都能命中深圳市
    else if (option.keywords?.split(' ').some(word => word.startsWith(q))) score = 5
    if (score >= 0) scored.push({ option, score })
  }

  // 同分时：常用项优先，其次层级更高（省 > 市 > 区县），再按名称更短
  scored.sort((a, b) => a.score - b.score
    || (a.option.hot ?? 999) - (b.option.hot ?? 999)
    || (a.option.depth ?? 0) - (b.option.depth ?? 0)
    || a.option.label.length - b.option.label.length)

  return scored.map(item => item.option)
})

/** 无关键词时若指定 collapseDepth，则只展示上级选项，避免几千条区县淹没列表 */
const base = computed<Option[]>(() => {
  if (query.value.trim() || !props.collapseDepth) return matched.value
  return props.options.filter(option => (option.depth ?? 0) < props.collapseDepth!)
})

const visible = computed(() => base.value.slice(0, props.resultLimit))
const truncated = computed(() => base.value.length > visible.value.length)

/* ---------------- 分栏联动 ---------------- */

const cascadeMode = computed(() => props.cascade && !query.value.trim())

/** value → option，用于沿 parent 还原选中项的层级路径 */
const byValue = computed(() => new Map(props.options.map(option => [String(option.value), option])))

/** 父子索引，分栏与「是否有下级」判断共用 */
const childrenMap = computed(() => {
  const map = new Map<string, Option[]>()
  for (const option of props.options) {
    if (!option.parent) continue
    const list = map.get(option.parent)
    if (list) list.push(option)
    else map.set(option.parent, [option])
  }
  return map
})

const cascadeRoots = computed(() => props.options.filter(option => !option.parent))

/** 当前展开的列：第一列固定为顶层，之后每个已悬停项追加一列，最多三列 */
const columns = computed<Option[][]>(() => {
  if (!cascadeMode.value) return []
  const cols: Option[][] = [cascadeRoots.value]
  const chain = hoverChain.value
  for (let i = 0; i < chain.length && cols.length < 3; i += 1) {
    const children = childrenMap.value.get(chain[i])
    if (!children?.length) break
    cols.push(children)
  }
  return cols
})

const columnCount = computed(() => columns.value.length || 1)

const collapsed = computed(() => !cascadeMode.value && !query.value.trim() && !!props.collapseDepth)
const footerVisible = computed(() => !cascadeMode.value && (truncated.value || collapsed.value))

function hasChildren(option: Option) {
  return childrenMap.value.has(String(option.value))
}

/** 选中项到根的路径，打开面板时用它预展开，让用户看到自己选的是哪一级 */
function chainOf(value: string): string[] {
  const path: string[] = []
  let node = byValue.value.get(value)
  let guard = 0
  while (node && guard < 6) {
    path.unshift(String(node.value))
    node = node.parent ? byValue.value.get(node.parent) : undefined
    guard += 1
  }
  return path
}

/** 悬停某列某一项：保留上层路径，替换该层及更深的展开状态 */
function hoverOption(col: number, option: Option) {
  const chain = hoverChain.value.slice(0, col)
  chain[col] = String(option.value)
  hoverChain.value = chain
}

/* ---------------- 定位与尺寸 ---------------- */

const panelStyle = computed<Record<string, string>>(() => {
  const a = anchor.value
  const width = cascadeMode.value
    ? Math.min(8 + columnCount.value * props.columnWidth, Math.max(240, window.innerWidth - 16))
    : Math.max(Math.round(a.width), props.panelWidth ?? 0)
  const maxLeft = Math.max(8, window.innerWidth - width - 8)
  const left = Math.max(8, Math.min(Math.round(a.left), maxLeft))
  const header = props.searchable ? 46 : 0
  const footer = footerVisible.value ? 40 : 0

  const style: Record<string, string> = {
    left: `${left}px`,
    top: `${dropUp.value
      ? Math.max(8, Math.round(a.top - listMax.value - header - footer - 6))
      : Math.round(a.bottom + 6)}px`,
    '--list-max': `${Math.round(listMax.value)}px`
  }
  // 分栏用确定宽度，否则搜索框的固有宽度会把面板撑得比列还宽
  if (cascadeMode.value) style.width = `${width}px`
  else style.minWidth = `${width}px`

  if (!cascadeMode.value) style.maxWidth = `${Math.min(420, window.innerWidth - 16)}px`
  return style
})

function measure() {
  const el = triggerEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  anchor.value = { left: rect.left, top: rect.top, bottom: rect.bottom, width: rect.width }

  const rows = cascadeMode.value
    ? columns.value.reduce((max, col) => Math.max(max, col.length), 1)
    : visible.value.length
  const header = props.searchable ? 46 : 0
  const footer = 40
  const desired = Math.min(props.searchable ? 320 : 268, rows * 32 + 8)
  const below = window.innerHeight - rect.bottom - 10
  const above = rect.top - 6
  dropUp.value = below < desired + header + footer && above > below
  const available = Math.max(140, (dropUp.value ? above : below) - header - footer)
  listMax.value = Math.max(120, Math.min(desired, available))
}

function bind() {
  document.addEventListener('mousedown', onDocDown)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', close)
}

function unbind() {
  document.removeEventListener('mousedown', onDocDown)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', close)
}

/** scroll 不冒泡但会在捕获阶段经过 window：滚动下拉自身或触发按钮时必须忽略，否则会立刻关闭 */
function onScroll(e: Event) {
  const target = e.target as Node | null
  if (!target) return
  if (panelEl.value?.contains(target)) return
  if (triggerEl.value?.contains(target)) return
  close()
}

function toggle() {
  if (props.disabled) return
  if (open.value) { close(); return }
  query.value = ''
  hoverChain.value = props.cascade ? chainOf(String(props.modelValue)) : []
  open.value = true
  activeIndex.value = visible.value.findIndex(o => o.value === props.modelValue)
  measure()
  bind()
  nextTick(() => {
    if (props.searchable) {
      searchEl.value?.focus()
      return
    }
    const selected = listEl.value?.querySelector<HTMLElement>('.dropdown-option.selected')
    if (selected) scrollItemIntoView(listEl.value, selected)
  })
}

function close() {
  if (!open.value) return
  open.value = false
  query.value = ''
  activeIndex.value = -1
  unbind()
}

function onDocDown(e: MouseEvent) {
  const target = e.target as Node
  if (triggerEl.value?.contains(target)) return
  if (panelEl.value?.contains(target)) return
  close()
}

function pick(option: Option) {
  emit('update:modelValue', option.value)
  close()
  triggerEl.value?.focus()
}

function onQueryInput() {
  activeIndex.value = visible.value.length ? 0 : -1
  nextTick(() => { if (listEl.value) listEl.value.scrollTop = 0 })
}

function clearQuery() {
  query.value = ''
  onQueryInput()
  searchEl.value?.focus()
}

function onKeydown(e: KeyboardEvent) {
  if (!open.value) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault()
      toggle()
    }
    return
  }

  if (e.key === 'Escape') {
    e.preventDefault()
    close()
    triggerEl.value?.focus()
    return
  }

  if (cascadeMode.value) {
    onCascadeKeydown(e)
    return
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (!visible.value.length) return
    activeIndex.value = Math.min(visible.value.length - 1, activeIndex.value + 1)
    scrollActive()
    return
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (!visible.value.length) return
    activeIndex.value = Math.max(0, activeIndex.value - 1)
    scrollActive()
    return
  }

  if (e.key === 'Enter') {
    e.preventDefault()
    const option = visible.value[activeIndex.value]
    if (option) pick(option)
  }
}

/** 分栏模式的键盘操作：上下键在最后一列移动并联动下一列，回车选中 */
function onCascadeKeydown(e: KeyboardEvent) {
  const cols = columns.value
  const last = cols.length - 1
  const col = cols[last]
  if (!col?.length) return

  const chain = hoverChain.value
  let index = chain.length === cols.length
    ? col.findIndex(o => String(o.value) === chain[last])
    : -1

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const step = e.key === 'ArrowDown' ? 1 : -1
    index = index < 0
      ? (step > 0 ? 0 : col.length - 1)
      : Math.max(0, Math.min(col.length - 1, index + step))
    hoverOption(last, col[index])
    scrollColumnItem(last, index)
    return
  }

  if (e.key === 'Enter') {
    e.preventDefault()
    if (index >= 0) pick(col[index])
  }
}

/** 只滚动下拉列表自身，避免 scrollIntoView 连带滚动外层面板（那会触发关闭） */
function scrollItemIntoView(list: HTMLElement | null, node: HTMLElement | null) {
  if (!list || !node) return
  const listRect = list.getBoundingClientRect()
  const nodeRect = node.getBoundingClientRect()
  if (nodeRect.top < listRect.top) list.scrollTop -= listRect.top - nodeRect.top
  else if (nodeRect.bottom > listRect.bottom) list.scrollTop += nodeRect.bottom - listRect.bottom
}

function scrollActive() {
  nextTick(() => {
    const nodes = listEl.value?.querySelectorAll<HTMLElement>('.dropdown-option')
    if (nodes) scrollItemIntoView(listEl.value, nodes[activeIndex.value] ?? null)
  })
}

function scrollColumnItem(col: number, index: number) {
  nextTick(() => {
    const list = panelEl.value?.querySelectorAll<HTMLElement>('.list')[col] ?? null
    const node = list?.querySelectorAll<HTMLElement>('.dropdown-option')[index] ?? null
    scrollItemIntoView(list, node)
  })
}

watch(() => props.disabled, value => { if (value) close() })
onBeforeUnmount(close)
</script>

<template>
  <div class="app-select" :class="[{ open, disabled }, size === 'sm' ? 'is-sm' : '']">
    <button
      :id="id"
      ref="triggerEl"
      type="button"
      class="trigger"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggle"
      @keydown="onKeydown"
    >
      <span class="value">{{ currentLabel }}</span>
      <svg class="chevron" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>

    <Teleport to="body">
      <Transition name="pop">
        <div v-if="open" ref="panelEl" class="dropdown-panel" :style="panelStyle">
          <div v-if="searchable" class="search">
            <svg class="search-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" />
            </svg>
            <input
              ref="searchEl"
              v-model="query"
              class="search-input"
              type="text"
              autocomplete="off"
              spellcheck="false"
              :placeholder="searchPlaceholder"
              @input="onQueryInput"
              @keydown="onKeydown"
            />
            <button v-if="query" class="search-clear" type="button" title="清空" @click="clearQuery">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <!-- 分栏联动：省 → 市 → 区县，逐列向右展开 -->
          <div v-if="cascadeMode" class="cols" :style="{ '--col-w': `${columnWidth}px` }">
            <ul v-for="(column, ci) in columns" :key="ci" class="list col" role="listbox">
              <li
                v-for="option in column"
                :key="option.value"
                class="dropdown-option"
                :class="{
                  selected: option.value === modelValue,
                  active: hoverChain[ci] === String(option.value),
                  group: ci === 0 && option.group
                }"
                role="option"
                :aria-selected="option.value === modelValue"
                @click="pick(option)"
                @mouseenter="hoverOption(ci, option)"
              >
                <span class="text">{{ option.label }}</span>
                <span class="meta">
                  <svg v-if="hasChildren(option)" class="caret" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                  <span v-else-if="option.hint" class="hint">{{ option.hint }}</span>
                  <svg v-if="option.value === modelValue" class="tick" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
              </li>
            </ul>
          </div>

          <!-- 平铺 / 搜索结果 -->
          <ul v-else ref="listEl" class="list" role="listbox">
            <li
              v-for="(option, index) in visible"
              :key="option.value"
              class="dropdown-option"
              :class="{ selected: option.value === modelValue, active: index === activeIndex, group: option.group }"
              role="option"
              :aria-selected="option.value === modelValue"
              :style="option.depth ? { paddingLeft: `${9 + option.depth * 16}px` } : undefined"
              @click="pick(option)"
              @mouseenter="activeIndex = index"
            >
              <span class="text">{{ option.label }}</span>
              <span class="meta">
                <span v-if="option.note && query.trim()" class="note">{{ option.note }}</span>
                <span v-if="option.hint" class="hint">{{ option.hint }}</span>
                <svg v-if="option.value === modelValue" class="tick" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
            </li>

            <li v-if="!visible.length" class="empty">{{ emptyText }}</li>
          </ul>

          <div v-if="footerVisible" class="more">
            {{ truncated ? `共 ${base.length} 项，继续输入以缩小范围` : collapseHint }}
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.app-select {
  position: relative;
  min-width: 0;
}

.trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  font-size: 12px;
  text-align: left;
  transition: border-color .15s, box-shadow .15s, background .15s;

  &:hover:not(:disabled) { border-color: var(--select-hover-border); }

  .app-select.open & {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px var(--brand-ring);
  }

  &:disabled {
    background: var(--surface-soft);
    color: var(--ink-3);
    cursor: not-allowed;
  }
}

.value {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.is-sm .trigger {
  height: 28px;
  padding: 0 8px;
  border-radius: 7px;
  font-size: 11.5px;
}

.is-sm .chevron { width: 11px; height: 11px; }

.chevron {
  flex: 0 0 auto;
  color: var(--ink-3);
  transition: transform .18s ease;
}

.app-select.open .chevron {
  transform: rotate(180deg);
  color: var(--brand);
}

.dropdown-panel {
  position: fixed;
  z-index: 80;
  padding: 4px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: var(--shadow-dropdown);
}

.search {
  position: relative;
  display: flex;
  align-items: center;
  padding: 2px 4px 6px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--border-row);
}

.search-icon {
  position: absolute;
  left: 10px;
  color: var(--ink-3);
  pointer-events: none;
}

.search-input {
  width: 100%;
  /* 输入框默认最小宽度由 size 属性撑开，会把分栏面板拉宽，这里允许收缩 */
  min-width: 0;
  height: 28px;
  padding: 0 22px 0 24px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-soft);
  color: var(--ink);
  font-size: 12px;
  outline: none;

  &::placeholder { color: var(--ink-3); }

  &:focus {
    border-color: var(--brand);
    background: var(--surface);
    box-shadow: 0 0 0 3px var(--brand-ring);
  }
}

.search-clear {
  position: absolute;
  right: 9px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;

  &:hover { background: var(--surface-soft); color: var(--ink); }
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: var(--list-max, 228px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* 分栏：每列独立滚动，中间用细线分隔 */
.cols {
  display: flex;
  align-items: stretch;
}

.col {
  flex: 0 0 auto;
  width: var(--col-w, 158px);
  padding: 0 2px;

  & + .col {
    margin-left: 2px;
    border-left: 1px solid var(--border-row);
  }
}

.dropdown-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 9px;
  border-radius: 7px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--ink-2);
  cursor: pointer;
  white-space: nowrap;

  &.active { background: var(--surface-soft); }

  &.selected {
    color: var(--brand);
    font-weight: 600;
    background: var(--brand-soft);
  }

  &.selected.active { background: var(--brand-soft); }

  &.group {
    color: var(--ink);
    font-weight: 600;
  }
}

.text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
}

.caret {
  flex: 0 0 auto;
  color: var(--ink-3);
  opacity: .65;
}

.dropdown-option.active .caret,
.dropdown-option.selected .caret {
  color: var(--brand);
  opacity: .9;
}

.hint {
  color: var(--ink-3);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  letter-spacing: .2px;
}

.note {
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ink-3);
  font-size: 11px;
  opacity: .85;
}

.dropdown-option.selected .hint { color: var(--brand); opacity: .75; }

.tick { flex: 0 0 auto; }

.empty {
  padding: 14px 10px;
  color: var(--ink-3);
  font-size: 12px;
  text-align: center;
}

.more {
  padding: 6px 10px 2px;
  border-top: 1px solid var(--border-row);
  margin-top: 4px;
  color: var(--ink-3);
  font-size: 11px;
}

.pop-enter-active, .pop-leave-active { transition: opacity .14s ease, transform .14s ease; }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: translateY(-4px) scale(.98); }
</style>
