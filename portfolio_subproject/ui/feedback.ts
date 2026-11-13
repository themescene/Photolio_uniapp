export function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  return message && !/[a-zA-Z]{4,}/.test(message) ? message : '暂时无法完成，请检查连接后重试'
}
export function askConfirm(content: string): Promise<boolean> {
  return new Promise(resolve => uni.showModal({ title: '确认操作', content, confirmText: '继续',
    cancelText: '取消', success: result => resolve(!!result.confirm), fail: () => resolve(false) }))
}
