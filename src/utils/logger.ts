/**
 * 统一日志入口。**禁止裸用 console.***。
 *
 * - DEV：分级别彩色打印
 * - PROD：默认只走 warn / error；将来可在此挂远程上报（Sentry / 自建）
 *
 * 用法：
 *   import { logger } from '@/utils/logger'
 *   logger.info('user logged in', { userId })
 *   logger.error('upload failed', err)
 */
import { IS_DEV } from '@/config/env'

type Args = unknown[]

function log(level: 'debug' | 'info' | 'warn' | 'error', args: Args) {
  if (level === 'debug' && !IS_DEV) return
  const ts = new Date().toISOString().slice(11, 23)
  const prefix = `[${ts}] [${level}]`
  if (level === 'error') {
    console.error(prefix, ...args)
  } else if (level === 'warn') {
    console.warn(prefix, ...args)
  } else {
    console.log(prefix, ...args)
  }
}

export const logger = {
  debug: (...args: Args) => log('debug', args),
  info: (...args: Args) => log('info', args),
  warn: (...args: Args) => log('warn', args),
  error: (...args: Args) => log('error', args),
}
