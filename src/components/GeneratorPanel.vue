<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStudio, buildGeneratePlan, type CountMode } from '@/composables/useStudio'
import { keywordSlug, parseKeywords, previewId, renderQrContent } from '@/utils/id'
import { regionOptions, normalizeCityCode } from '@/utils/city'
import { normalizeLogo } from '@/utils/qrcode'
import { isTauri } from '@/utils/platform'
import AppSelect from '@/components/AppSelect.vue'
import type { AppConfig, LogoPosition } from '@/types'

type KeywordMode = AppConfig['id']['keywordMode']
type DateFormat = AppConfig['id']['dateFormat']
type Charset = AppConfig['id']['charset']
type Ecc = AppConfig['qr']['errorCorrectionLevel']

const keywordModeOptions: Array<{ value: KeywordMode; label: string }> = [
  { value: 'initials', label: '转拼音首字母（张三 → ZS）' },
  { value: 'pinyin', label: '转全拼（张三 → ZHANGSAN）' },
  { value: 'raw', label: '保留原文' },
  { value: 'none', label: '不写入 ID' }
]

const separatorOptions: Array<{ value: string; label: string }> = [
  { value: '-', label: '短横线 -' },
  { value: '', label: '无' },
  { value: '_', label: '下划线 _' },
  { value: '.', label: '点 .' }
]

const dateFormatOptions: Array<{ value: DateFormat; label: string }> = [
  { value: 'YYYYMMDD', label: '20260101' },
  { value: 'YYMMDD', label: '260101' },
  { value: 'YYYYMM', label: '202601' },
  { value: 'YYYY', label: '2026' }
]

const charsetOptions: Array<{ value: Charset; label: string }> = [
  { value: 'upper', label: '大写字母 + 数字（无 I/O）' },
  { value: 'digits', label: '纯数字' },
  { value: 'alnum', label: '大小写 + 数字' },
  { value: 'lower', label: '小写字母' },
  { value: 'hex', label: '十六进制' }
]

const eccOptions: Array<{ value: Ecc; label: string }> = [
  { value: 'L', label: 'L · 7%' },
  { value: 'M', label: 'M · 15%' },
  { value: 'Q', label: 'Q · 25%' },
  { value: 'H', label: 'H · 30%' }
]

const { config, generate, resetConfig, busy, nextSequence, notify } = useStudio()

const keywordsText = ref('')
const countMode = ref<CountMode>('total')
const count = ref(10)
const note = ref('')
const submitting = ref(false)

const presets = [10, 50, 100, 200]

/** 城市下拉：省 / 市 / 区县三级，可搜索（名称、代码、拼音、首字母） */
const cityOptions = regionOptions()

function applyCityCode(code: string) {
  config.value.id.cityCode = normalizeCityCode(code)
}

/** 只保留字母 / 数字 / _ / -，避免非法字符进入 ID */
function onCityInput(event: Event) {
  const el = event.target as HTMLInputElement
  const next = normalizeCityCode(el.value)
  config.value.id.cityCode = next
  if (el.value !== next) el.value = next
}

const maxCount = computed(() => (countMode.value === 'total' ? 500 : 200))
const safeCount = computed(() =>
  Math.max(1, Math.min(maxCount.value, Math.floor(Number(count.value)) || 1))
)

const keywords = computed(() => parseKeywords(keywordsText.value))
const plan = computed(() => buildGeneratePlan(keywords.value, countMode.value, safeCount.value))
const totalToCreate = computed(() => plan.value.reduce((sum, item) => sum + item.count, 0))

const planHint = computed(() => {
  if (countMode.value !== 'total' || keywords.value.length < 2) return ''
  const items = plan.value
  const head = items.slice(0, 4).map(i => `${i.keyword}×${i.count}`).join('  ')
  return items.length > 4 ? `${head} …` : head
})

/**
 * 示例只反映当前输入：没填关键词就不带关键词段，不塞占位词。
 * 否则会出现「关键词留空却预览出 CPA 这类段」的错觉。
 */
const firstKeyword = computed(() => keywords.value[0] ?? '')
const sampleSlug = computed(() =>
  firstKeyword.value ? keywordSlug(firstKeyword.value, config.value.id) : ''
)

const sampleId = computed(() => previewId(config.value.id, sampleSlug.value, nextSequence.value))

const sampleContent = computed(() => renderQrContent(config.value.qr.contentTemplate, {
  id: sampleId.value,
  keyword: firstKeyword.value,
  slug: sampleSlug.value,
  city: config.value.id.cityCode,
  sequence: nextSequence.value,
  date: new Date(),
  prefix: config.value.id.prefix
}))

/** 内容模板把 ID 包成链接之类时才单独显示第二行，避免与 ID 重复 */
const contentDiffers = computed(() => sampleContent.value.trim() !== sampleId.value.trim())

async function submit() {
  if (submitting.value) return
  if (keywordsText.value.trim() && keywords.value.length === 0) {
    notify('关键词格式无效', 'warn')
    return
  }
  submitting.value = true
  try {
    await generate(keywordsText.value, countMode.value, safeCount.value, note.value.trim())
  } catch (e) {
    notify(`生成失败：${String(e)}`, 'err')
  } finally {
    submitting.value = false
  }
}

function onShortcut(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    void submit()
  }
}

interface PositionSlot {
  key: string
  pos: LogoPosition | null
  label: string
  disabled: boolean
  title: string
}

const positionSlots: PositionSlot[] = [
  { key: 'tl', pos: null, label: '', disabled: true, title: '左上角是二维码定位点，放 logo 会导致无法识别' },
  { key: 'top', pos: 'top', label: '上', disabled: false, title: '上方中间' },
  { key: 'tr', pos: null, label: '', disabled: true, title: '右上角是二维码定位点，放 logo 会导致无法识别' },
  { key: 'left', pos: 'left', label: '左', disabled: false, title: '左侧中间' },
  { key: 'center', pos: 'center', label: '中', disabled: false, title: '居中（推荐，配合 H 级纠错）' },
  { key: 'right', pos: 'right', label: '右', disabled: false, title: '右侧中间' },
  { key: 'bl', pos: null, label: '', disabled: true, title: '左下角是二维码定位点，放 logo 会导致无法识别' },
  { key: 'bottom', pos: 'bottom', label: '下', disabled: false, title: '下方中间' },
  { key: 'br', pos: null, label: '', disabled: true, title: '右下角有对齐图案，放 logo 会导致无法识别' }
]

const logoBusy = ref(false)

function choosePosition(pos: LogoPosition | null) {
  if (pos) config.value.qr.logo.position = pos
}

async function applyLogo(file: Blob) {
  logoBusy.value = true
  try {
    const url = await normalizeLogo(file)
    config.value.qr.logo.dataUrl = url
    config.value.qr.logo.enabled = true
    if (config.value.qr.errorCorrectionLevel !== 'H') {
      notify('已添加 logo，建议把纠错等级调为 H 以保证可识别', 'warn')
    }
  } catch (e) {
    notify(`图片处理失败：${String(e)}`, 'err')
  } finally {
    logoBusy.value = false
  }
}

async function pickLogo() {
  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const { readFile } = await import('@tauri-apps/plugin-fs')
      const picked = await open({
        multiple: false,
        title: '选择 Logo 图片',
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'] }]
      })
      if (typeof picked !== 'string' || !picked) return
      const bytes = await readFile(picked)
      const ext = picked.split('.').pop()?.toLowerCase() ?? 'png'
      const mime = ext === 'jpg' ? 'jpeg' : ext
      await applyLogo(new Blob([bytes.slice().buffer as ArrayBuffer], { type: `image/${mime}` }))
    } catch (e) {
      notify(`选择图片失败：${String(e)}`, 'err')
    }
    return
  }

  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = () => {
    const file = input.files?.[0]
    if (file) void applyLogo(file)
  }
  input.click()
}

function clearLogo() {
  config.value.qr.logo.dataUrl = ''
  config.value.qr.logo.enabled = false
}

function forceHighEcc() {
  config.value.qr.errorCorrectionLevel = 'H'
  notify('纠错等级已设为 H（30%）')
}
</script>

<template>
  <aside class="panel card" @keydown="onShortcut">
    <div class="panel-head">
      <h2>生成配置</h2>
      <span class="tag">不重复</span>
    </div>

    <div class="panel-body">
      <section class="sub-card">
        <div class="sub-head">
          <h3>生成任务</h3>
          <p>留空关键词则不写该段</p>
        </div>

        <div class="stack">
          <div class="field">
            <label for="kw">关键词<span class="sub">每行一个，也支持逗号 / 顿号分隔</span></label>
            <textarea id="kw" v-model="keywordsText" class="textarea" rows="3" placeholder="例如：春季新品&#10;设备A-001&#10;张三" />
            <div class="kw-meta">
              <span>{{ keywords.length ? `识别到 ${keywords.length} 个关键词` : '留空则生成不带关键词的 ID' }}</span>
              <span>共 <b>{{ totalToCreate }}</b> 个</span>
            </div>
          </div>

          <div class="field">
            <label>创建数量</label>
            <div class="seg">
              <button type="button" :class="{ on: countMode === 'total' }" @click="countMode = 'total'">总数量</button>
              <button type="button" :class="{ on: countMode === 'per' }" @click="countMode = 'per'">每个关键词</button>
            </div>
            <div class="count-row">
              <input v-model.number="count" class="input count-input" type="number" min="1" :max="maxCount"
                aria-label="创建数量" />
              <div class="presets">
                <button v-for="p in presets" :key="p" type="button" class="preset" :class="{ on: safeCount === p }"
                  @click="count = p">{{ p }}</button>
              </div>
            </div>
            <div v-if="planHint" class="plan-hint">{{ planHint }}</div>
          </div>

          <div class="field">
            <label for="note">备注（可选）</label>
            <input id="note" v-model="note" class="input" type="text" placeholder="批次 / 用途" />
          </div>
        </div>
      </section>

      <details class="group" open>
        <summary>ID 组成规则</summary>

        <div class="stack">
          <section class="sub-card">
            <div class="sub-head">
              <h3>基础信息</h3>
              <p>两端固定，城市按需插入</p>
            </div>

            <div class="grid-2">
              <div class="field">
                <label for="prefix">固定前缀</label>
                <input id="prefix" v-model="config.id.prefix" class="input" type="text" placeholder="ID" />
              </div>
              <div class="field">
                <label for="suffix">固定后缀</label>
                <input id="suffix" v-model="config.id.suffix" class="input" type="text" placeholder="可留空" />
              </div>

              <div class="field span-2">
                <label for="city">城市编码
                  <span class="sub">悬停逐级展开，或搜索名称 / 代码 / 拼音；留空则不写入</span>
                </label>
                <div class="city-row">
                  <input id="city" class="input mono" type="text" maxlength="8" placeholder="可留空，如 310000"
                    :value="config.id.cityCode" @input="onCityInput" />
                  <AppSelect class="city-picker" size="md" searchable cascade :column-width="164"
                    search-placeholder="搜索城市 / 区县"
                    :result-limit="400" :panel-width="304"
                    empty-text="没有匹配项，可直接输入代码"
                    :model-value="config.id.cityCode" :options="cityOptions"
                    :placeholder="config.id.cityCode || '选择城市'" @update:model-value="applyCityCode" />
                </div>
              </div>
            </div>
          </section>

          <section class="sub-card">
            <div class="sub-head">
              <h3>关键词段</h3>
              <p>怎么写入、段间怎么连接</p>
            </div>

            <div class="grid-2">
              <div class="field span-2">
                <label for="kwmode">处理方式</label>
                <AppSelect id="kwmode" v-model="config.id.keywordMode" :options="keywordModeOptions" />
              </div>

              <div class="field">
                <label for="kwlen">关键词段最长</label>
                <input id="kwlen" v-model.number="config.id.keywordMaxLength" class="input" type="number" min="1"
                  max="32" />
              </div>
              <div class="field">
                <label for="sep">分隔符</label>
                <AppSelect id="sep" v-model="config.id.separator" :options="separatorOptions" />
              </div>

              <div class="field span-2">
                <label class="checkbox-row">
                  <input v-model="config.id.keywordUppercase" type="checkbox" />
                  关键词段转为大写
                </label>
              </div>
            </div>
          </section>

          <section class="sub-card">
            <div class="sub-head">
              <h3>日期与序号</h3>
              <p>时间、序号、随机位与校验位</p>
            </div>

            <div class="grid-2">
              <div class="field span-2">
                <label class="checkbox-row">
                  <input v-model="config.id.includeDate" type="checkbox" />
                  写入日期
                </label>
                <AppSelect v-model="config.id.dateFormat" :options="dateFormatOptions" :disabled="!config.id.includeDate" />
              </div>

              <div class="field">
                <label for="seqlen">序号位数</label>
                <input id="seqlen" v-model.number="config.id.sequenceLength" class="input" type="number" min="0" max="10" />
              </div>
              <div class="field">
                <label for="randlen">随机位长度</label>
                <input id="randlen" v-model.number="config.id.randomLength" class="input" type="number" min="0" max="16" />
              </div>

              <div class="field span-2">
                <label for="charset">随机字符集</label>
                <AppSelect id="charset" v-model="config.id.charset" :options="charsetOptions" />
              </div>

              <div class="field span-2">
                <label class="checkbox-row">
                  <input v-model="config.id.checksum" type="checkbox" />
                  追加校验位
                </label>
              </div>
            </div>
          </section>
        </div>
      </details>

      <details class="group">
        <summary>二维码设置</summary>

        <div class="stack">
          <section class="sub-card">
            <div class="sub-head">
              <h3>二维码内容</h3>
              <p>模板决定扫码看到的内容</p>
            </div>

            <div class="stack">
              <div class="field">
                <label for="tpl">二维码内容模板</label>
                <input id="tpl" v-model="config.qr.contentTemplate" class="input mono" type="text" />
                <div class="hint-line">
                  占位符：<code>{id}</code> <code>{keyword}</code> <code>{slug}</code> <code>{city}</code> <code>{date}</code> <code>{sequence}</code>
                </div>
              </div>

              <div class="grid-2">
                <div class="field">
                  <label for="ecc">纠错等级</label>
                  <AppSelect id="ecc" v-model="config.qr.errorCorrectionLevel" :options="eccOptions" />
                </div>
                <div class="field">
                  <label for="qsize">图片尺寸 (px)</label>
                  <input id="qsize" v-model.number="config.qr.size" class="input" type="number" min="128" max="2048"
                    step="32" />
                </div>
                <div class="field">
                  <label for="qmargin">静区边距</label>
                  <input id="qmargin" v-model.number="config.qr.margin" class="input" type="number" min="0" max="10" />
                </div>
                <div class="field">
                  <label>配色</label>
                  <div class="colors">
                    <label class="color-chip" title="前景色">
                      <input v-model="config.qr.foreground" type="color" />
                      <span>码</span>
                    </label>
                    <label class="color-chip" title="背景色">
                      <input v-model="config.qr.background" type="color" />
                      <span>底</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="sub-card">
            <div class="sub-head has-action">
              <h3>Logo</h3>
              <p>叠加在码中央</p>
              <label class="checkbox-row sub-action">
                <input v-model="config.qr.logo.enabled" type="checkbox" :disabled="!config.qr.logo.dataUrl" />
                启用
              </label>
            </div>

            <div class="stack">
              <div class="logo-row">
                <div class="logo-thumb">
                  <img v-if="config.qr.logo.dataUrl" :src="config.qr.logo.dataUrl" alt="logo 预览" />
                  <span v-else>无图</span>
                </div>
                <div class="logo-actions">
                  <button class="btn btn-sm" :disabled="logoBusy" @click="pickLogo">
                    {{ config.qr.logo.dataUrl ? '更换图片' : '选择图片' }}
                  </button>
                  <button v-if="config.qr.logo.dataUrl" class="btn btn-sm btn-danger" @click="clearLogo">移除</button>
                </div>
              </div>

              <template v-if="config.qr.logo.dataUrl">
                <div class="field">
                  <label>位置<span class="sub">✕ 处被结构性图案占用，不可放置</span></label>
                  <div class="pos-grid">
                    <button v-for="slot in positionSlots" :key="slot.key" type="button" class="pos-cell"
                      :class="{ on: config.qr.logo.position === slot.pos, blocked: slot.disabled }"
                      :disabled="slot.disabled" :title="slot.title" @click="choosePosition(slot.pos)">{{ slot.disabled ? '✕'
                        : slot.label }}</button>
                  </div>
                </div>

                <div class="field">
                  <label>Logo 大小 <b>{{ config.qr.logo.sizePercent }}%</b></label>
                  <input v-model.number="config.qr.logo.sizePercent" class="range" type="range" min="8" max="24" step="1" />
                </div>

                <div class="logo-toggles">
                  <label class="checkbox-row"><input v-model="config.qr.logo.circular" type="checkbox" />圆形裁切</label>
                  <label class="checkbox-row"><input v-model="config.qr.logo.padding" type="checkbox" />白色衬垫</label>
                </div>

                <button v-if="config.qr.errorCorrectionLevel !== 'H'" type="button" class="ecc-hint" @click="forceHighEcc">
                  当前纠错 {{ config.qr.errorCorrectionLevel }} 级，点此改为 H（30%）更保险
                </button>
              </template>
            </div>
          </section>

          <button class="btn btn-sm reset" @click="resetConfig">恢复默认规则</button>
        </div>
      </details>
    </div>
    <div class="sample">
      <div class="sample-content">
        <span>规则示例</span>
        <code class="mono">{{ sampleId }}</code>
        <template v-if="contentDiffers">
          <span class="sample-sub">二维码内容</span>
          <code class="mono ellipsis" :title="sampleContent">{{ sampleContent }}</code>
        </template>
      </div>
    </div>
    <div class="panel-foot">
      <button class="btn btn-primary btn-block" :disabled="submitting || busy" @click="submit">
        {{ submitting ? '生成中…' : `生成 ID + 二维码（${totalToCreate}）` }}
      </button>
      <p class="foot-hint">Ctrl / ⌘ + Enter 快速生成 · 生成即写入本地并自动去重</p>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 auto;
  padding: 13px 16px;
  border-bottom: 1px solid var(--border);

  h2 {
    margin: 0;
    font-size: 13.5px;
    font-weight: 700;
    letter-spacing: .3px;
  }
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-foot {
  flex: 0 0 auto;
  padding: 12px 16px 14px;
  border-top: 1px solid var(--border);
  background: var(--surface-soft);
}

.btn-block {
  width: 100%;
  min-height: 38px;
  font-size: 13px;
}

.foot-hint {
  margin: 7px 0 0;
  text-align: center;
  font-size: 10.5px;
  color: var(--ink-3);
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.span-2 {
  grid-column: span 2;
}

/* 组内纵向堆叠：普通字段网格与关键词子模块之间保持统一间距 */
/* 卡片内纵向堆叠，统一 10px 间距 */
.stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 模块卡片：淡底 + 描边圈出相关字段，标题比二级小、比字段标签重 */
.sub-card {
  padding: 10px 10px 11px;
  border: 1px solid var(--card-border);
  border-radius: 10px;
  background: var(--card-bg);
  box-shadow: var(--card-shadow);
}

.sub-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--card-border);

  h3 {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .3px;
    color: var(--ink);
  }

  p {
    margin: 0;
    font-size: 10px;
    line-height: 1.45;
    color: var(--ink-3);
  }
}

/* 卡片右上角的开关，如 Logo「启用」 */
.sub-head .sub-action {
  margin-left: auto;
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-2);
  white-space: nowrap;
}

/* 卡片内的下拉与输入框统一 32px 高，避免同一行两栏底部错位 */
.sub-card :deep(.app-select .trigger) {
  height: 32px;
}

.city-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.city-picker {
  flex: 0 0 108px;
  width: 108px;

  :deep(.trigger) {
    height: 32px;
  }
}

.field>label .sub {
  display: block;
  margin-top: 2px;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--ink-3);
  font-size: 10px;
  line-height: 1.5;
}

.kw-meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 10.5px;
  color: var(--ink-3);

  span {
    white-space: nowrap;
  }

  b {
    color: var(--brand);
  }
}

.seg {
  display: inline-flex;
  align-self: flex-start;
  padding: 2px;
  background: var(--surface-soft);
  border: 1px solid var(--border-strong);
  border-radius: 8px;

  button {
    border: none;
    background: none;
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-3);
    transition: all .15s;

    &.on {
      background: var(--surface-raised);
      color: var(--brand);
      box-shadow: var(--shadow-raised);
    }
  }
}

.count-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.count-input {
  flex: 0 0 84px;
  width: 84px;
}

.presets {
  display: flex;
  gap: 4px;
}

.preset {
  min-width: 34px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: var(--surface);
  font-size: 11px;
  color: var(--ink-3);
  transition: all .15s;

  &:hover {
    border-color: var(--brand);
    color: var(--brand);
  }

  &.on {
    border-color: var(--brand);
    color: var(--brand);
    background: var(--brand-soft);
  }
}

.plan-hint {
  font-size: 10.5px;
  color: var(--ink-3);
  word-break: break-all;
}

.check-bottom {
  padding-top: 18px;
}

.sample {
  margin-top: 18px;
  padding: 10px 12px;
  border-radius: 10px;
  background: linear-gradient(180deg, var(--sample-bg-1), var(--sample-bg-2));
  border: 1px solid var(--brand-line);
  font-size: 10.5px;
  color: var(--ink-sample);

  span {
    display: block;
    margin-bottom: 5px;
    font-weight: 600;
    letter-spacing: .2px;
  }

  .sample-sub { margin-top: 10px; }

  code {
    display: block;
    padding: 6px 9px;
    border-radius: 6px;
    background: var(--surface);
    border: 1px solid var(--brand-line);
    color: var(--brand);
    font-size: 11px;
    font-weight: 600;
    word-break: break-all;
  }

  .ellipsis {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.hint-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-bottom: 2px;
  font-size: 10px;
  line-height: 1.6;
  color: var(--ink-3);

  code {
    padding: 1px 4px;
    border-radius: 4px;
    background: var(--brand-soft);
    color: var(--brand);
    font-size: 10px;
  }
}

.colors {
  display: flex;
  gap: 8px;
}

.color-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 8px 0 4px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  font-size: 11px;
  color: var(--ink-3);
  cursor: pointer;

  input {
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
  }
}

.reset {
  width: 100%;
}

.logo-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-thumb {
  flex: 0 0 46px;
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  background: var(--surface);
  font-size: 10px;
  color: var(--ink-3);

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

.logo-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pos-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  width: 148px;
}

.pos-cell {
  height: 30px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: var(--surface);
  font-size: 11px;
  color: var(--ink-3);
  transition: all .15s;

  &:hover:not(:disabled) {
    border-color: var(--brand);
    color: var(--brand);
  }

  &.on {
    border-color: var(--brand);
    background: var(--brand-soft);
    color: var(--brand);
    font-weight: 700;
  }

  &.blocked {
    border-style: dashed;
    background: var(--blocked-bg);
    color: var(--ink-blocked);
    cursor: not-allowed;
  }
}

.range {
  width: 100%;
  height: 18px;
  accent-color: var(--brand);
}

.logo-toggles {
  display: flex;
  gap: 14px;
  margin-top: 8px;
}

.ecc-hint {
  width: 100%;
  margin-top: 9px;
  padding: 6px 8px;
  border: 1px dashed var(--border-warn);
  border-radius: 7px;
  background: var(--surface-warn);
  color: var(--ink-warn);
  font-size: 10.5px;
  line-height: 1.5;
  text-align: left;

  &:hover {
    background: var(--surface-warn-hover);
  }
}

.field>label b {
  color: var(--brand);
}
</style>
