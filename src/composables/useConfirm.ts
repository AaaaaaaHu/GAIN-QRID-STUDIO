import { ref } from 'vue'

export interface ConfirmOptions {
  title: string
  message: string
  /** 补充信息，如完整路径、文件清单，按原样换行显示 */
  detail?: string
  okText?: string
  cancelText?: string
  /** 危险操作：确认按钮变红，默认焦点放在取消上 */
  danger?: boolean
}

interface ConfirmState extends ConfirmOptions {
  open: boolean
}

const state = ref<ConfirmState>({
  open: false,
  title: '',
  message: ''
})

let resolver: ((ok: boolean) => void) | null = null

/** 打开自定义确认弹窗，返回用户是否确认 */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  resolver?.(false)
  return new Promise<boolean>(resolve => {
    resolver = resolve
    state.value = { ...options, open: true }
  })
}

export function resolveConfirm(ok: boolean) {
  resolver?.(ok)
  resolver = null
  state.value = { ...state.value, open: false }
}

export function useConfirmState() {
  return { state, resolveConfirm }
}
