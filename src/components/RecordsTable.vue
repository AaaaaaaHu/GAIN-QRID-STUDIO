<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStudio } from '@/composables/useStudio'
import { formatTimestamp } from '@/utils/format'

const {
  filteredRecords, selectedIds, activeId, search,
  toggleSelect, selectAllFiltered, clearSelection, clearRecords, removeRecord, copy
} = useStudio()

const limit = ref(200)
const visible = computed(() => filteredRecords.value.slice(0, limit.value))
const hasMore = computed(() => filteredRecords.value.length > visible.value.length)
const allChecked = computed(() =>
  visible.value.length > 0 && visible.value.every(r => selectedIds.value.includes(r.id))
)

function toggleAll() {
  if (allChecked.value) {
    clearSelection()
  } else {
    selectAllFiltered()
  }
}

// 确认交给统一的 ConfirmDialog（useStudio 内部调用），这里只负责触发
function confirmClear() {
  if (filteredRecords.value.length === 0) return
  void clearRecords()
}

function confirmRemove(id: string) {
  void removeRecord(id)
}
</script>

<template>
  <section class="records card">
    <div class="head">
      <div class="title-block">
        <h2>生成记录</h2>
        <span class="count">{{ filteredRecords.length }}{{ search ? ' 条匹配' : ' 条' }}</span>
      </div>

      <div class="tools">
        <input v-model="search" class="input search" type="search" placeholder="搜索 ID / 关键词 / 备注" />
        <button class="btn btn-sm" :disabled="!filteredRecords.length" @click="selectAllFiltered">全选</button>
        <button class="btn btn-sm" :disabled="!selectedIds.length" @click="clearSelection">清除选择</button>
        <button class="btn btn-sm btn-danger" :disabled="!filteredRecords.length" @click="confirmClear">清空记录</button>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="col-check">
              <input type="checkbox" :checked="allChecked" :disabled="!visible.length" @change="toggleAll" />
            </th>
            <th class="col-id">ID</th>
            <th class="col-kw">关键词</th>
            <th>二维码内容</th>
            <th class="col-time">生成时间</th>
            <th class="col-act" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="rec in visible"
            :key="rec.id"
            :class="{ active: rec.id === activeId, picked: selectedIds.includes(rec.id) }"
            @click="activeId = rec.id"
          >
            <td class="col-check" @click.stop>
              <input type="checkbox" :checked="selectedIds.includes(rec.id)" @change="toggleSelect(rec.id)" />
            </td>
            <td class="col-id"><span class="mono">{{ rec.id }}</span></td>
            <td class="col-kw">
              {{ rec.keyword || '—' }}
              <span v-if="rec.note" class="note">{{ rec.note }}</span>
            </td>
            <td class="content mono">{{ rec.content }}</td>
            <td class="col-time">{{ formatTimestamp(rec.createdAt) }}</td>
            <td class="col-act" @click.stop>
              <button class="link" title="复制 ID" @click="copy(rec.id)">复制</button>
              <button class="link danger" title="删除" @click="confirmRemove(rec.id)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="!filteredRecords.length" class="empty">
        <div class="empty-icon">▤</div>
        <p>{{ search ? '没有匹配的记录' : '还没有生成记录' }}</p>
      </div>

      <div v-if="hasMore" class="more">
        <button class="btn btn-sm" @click="limit += 200">加载更多（剩余 {{ filteredRecords.length - visible.length }} 条）</button>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.records {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}

.title-block {
  display: flex;
  align-items: center;
  gap: 8px;

  h2 { margin: 0; font-size: 13px; font-weight: 700; }
}

.count {
  padding: 1px 7px;
  border-radius: 20px;
  background: var(--brand-soft);
  color: var(--brand);
  font-size: 10.5px;
  font-weight: 700;
}

.tools { display: flex; align-items: center; gap: 6px; }
.search { width: 190px; min-height: 28px; height: 28px; font-size: 11.5px; }

.table-wrap { flex: 1; min-height: 0; overflow: auto; }

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

th, td {
  padding: 7px 10px;
  text-align: left;
  font-size: 11.5px;
  border-bottom: 1px solid #f0f3fa;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--surface-soft);
  color: var(--ink-3);
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: .3px;
}

tbody tr {
  cursor: pointer;
  transition: background .12s;

  &:hover { background: #f8faff; }
  &.active { background: #eef2ff; box-shadow: inset 3px 0 0 var(--brand); }
  &.picked { background: #f3f6ff; }
}

.col-check { width: 34px; padding-right: 0; }
.col-id { width: 228px; }
.col-kw { width: 108px; }
.col-time { width: 140px; color: var(--ink-3); }
.col-act { width: 92px; text-align: right; }

td.col-id .mono { font-size: 10.8px; color: var(--ink); font-weight: 600; }
td.content { color: var(--ink-3); font-size: 11px; }

.note {
  display: block;
  font-size: 10px;
  color: var(--ink-3);
  font-style: normal;
}

.link {
  border: none;
  background: none;
  padding: 0 4px;
  color: var(--brand);
  font-size: 11px;

  &:hover { text-decoration: underline; }
  &.danger { color: var(--err); }
}

.more { display: flex; justify-content: center; padding: 10px; }

input[type="checkbox"] { accent-color: var(--brand); width: 13px; height: 13px; margin: 0; }

p { margin: 0; }
</style>
