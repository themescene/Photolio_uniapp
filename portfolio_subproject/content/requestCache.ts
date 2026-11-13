/** 只复用只读浏览请求；账号切换清空，旧账号的异步结果不会写入新缓存。 */
export class ReadRequestCache {
  private scope = ''
  private values = new Map<string, { expires: number; value: unknown }>()
  private pending = new Map<string, Promise<unknown>>()
  constructor(private ttl = 30000, private limit = 40) {}
  read<T>(scope: string, key: string, loader: () => Promise<T>, refresh = false): Promise<T> {
    if (scope !== this.scope) { this.scope = scope; this.values.clear(); this.pending.clear() }
    const cached = this.values.get(key)
    if (!refresh && cached && cached.expires > Date.now()) return Promise.resolve(cached.value as T)
    const existing = this.pending.get(key)
    if (existing) return existing as Promise<T>
    const task = loader().then(value => {
      if (this.scope === scope && this.pending.get(key) === task) {
        this.values.delete(key); this.values.set(key, { value, expires: Date.now() + this.ttl })
        if (this.values.size > this.limit) this.values.delete(this.values.keys().next().value as string)
      }
      return value
    }).finally(() => { if (this.pending.get(key) === task) this.pending.delete(key) })
    this.pending.set(key, task)
    return task
  }
}
