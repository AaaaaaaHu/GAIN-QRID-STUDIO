<script setup lang="ts">
import { computed } from 'vue'
import { useStudio } from '@/composables/useStudio'
import { formatTimestamp } from '@/utils/format'

const { activeRecord, qrDataUrl, copy, doExportPng, busy } = useStudio()

const createdText = computed(() =>
  activeRecord.value ? formatTimestamp(activeRecord.value.createdAt) : ''
)
</script>

<template>
  <section class="preview card">
    <div class="section-title">
      <span>当前二维码</span>
      <span class="hint">内容变更后实时重绘</span>
    </div>

    <div v-if="activeRecord" class="body">
      <div class="qr-box">
        <img v-if="qrDataUrl" :src="qrDataUrl" alt="二维码" />
        <div v-else class="qr-loading">生成中…</div>
      </div>

      <div class="info">
        <div class="id-row">
          <div class="id-label">ID</div>
          <div class="id-value mono">{{ activeRecord.id }}</div>
          <button class="btn btn-icon" title="复制 ID" @click="copy(activeRecord.id)">⧉</button>
        </div>

        <dl class="meta-grid">
          <div>
            <dt>关键词</dt>
            <dd>{{ activeRecord.keyword || '—' }}</dd>
          </div>
          <div>
            <dt>关键词段</dt>
            <dd class="mono">{{ activeRecord.keywordSlug || '—' }}</dd>
          </div>
          <div>
            <dt>序号</dt>
            <dd class="mono">{{ activeRecord.sequence }}</dd>
          </div>
          <div>
            <dt>生成时间</dt>
            <dd>{{ createdText }}</dd>
          </div>
          <div class="span-2">
            <dt>二维码内容</dt>
            <dd class="mono content">{{ activeRecord.content }}</dd>
          </div>
          <div v-if="activeRecord.note" class="span-2">
            <dt>备注</dt>
            <dd>{{ activeRecord.note }}</dd>
          </div>
        </dl>

        <div class="actions">
          <button class="btn" @click="copy(activeRecord.content)">复制二维码内容</button>
          <button class="btn" :disabled="busy || !qrDataUrl" @click="doExportPng">下载二维码 PNG</button>
        </div>
      </div>
    </div>

    <div v-else class="empty">
      <div class="empty-icon">▦</div>
      <p>左侧输入关键词后点击生成</p>
      <p class="dim">生成的 ID 与二维码会自动保存到本地</p>
    </div>
  </section>
</template>

<style scoped lang="scss">
.preview { padding: 14px 16px 16px; }

.body {
  display: flex;
  gap: 18px;
  align-items: stretch;
}

.qr-box {
  flex: 0 0 auto;
  box-sizing: border-box;
  align-self: center;
  width: 220px;
  height: 220px;
  display: grid;
  place-items: center;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background:
    linear-gradient(45deg, var(--surface-checker) 25%, transparent 25%) -8px 0/16px 16px,
    linear-gradient(-45deg, var(--surface-checker) 25%, transparent 25%) -8px 0/16px 16px,
    var(--surface-checker-base);

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 6px;
    image-rendering: pixelated;
  }
}

.qr-loading { font-size: 11px; color: var(--ink-3); }

.info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }

.id-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 11px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--id-bg-1), var(--id-bg-2));
  border: 1px solid var(--border-info);
}

.id-label {
  flex: 0 0 auto;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .8px;
  color: var(--brand);
}

.id-value {
  flex: 1;
  min-width: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--ink);
  word-break: break-all;
  line-height: 1.3;
}

.meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 14px;
  margin: 0;

  > div { min-width: 0; }

  dt { font-size: 10.5px; color: var(--ink-3); margin-bottom: 1px; }
  dd { margin: 0; font-size: 12px; color: var(--ink); word-break: break-all; }

  .span-2 { grid-column: span 2; }
  .content { font-size: 11.5px; color: var(--ink-2); }
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: auto;

  .btn { flex: 1; }
}

.dim { color: var(--ink-3); font-size: 11px; margin: 0; }
p { margin: 0; }
</style>
