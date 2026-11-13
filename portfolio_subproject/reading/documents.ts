export type DocumentKind = 'pdf' | 'docx'

export function documentKind(url: string, title = ''): DocumentKind | undefined {
  try {
    const parsed = new URL(url)
    const names = [parsed.pathname, parsed.searchParams.get('name') || '', title]
    for (const name of names) {
      const extension = name.trim().match(/\.(pdf|docx)$/i)?.[1].toLowerCase()
      if (extension === 'pdf' || extension === 'docx') return extension
    }
  } catch { /* Invalid URLs have no reader. */ }
}

export const DOCX_FRAME = `<!doctype html><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'">
<style>body{margin:0;color:#222;background:#fff;overflow-wrap:anywhere}
.docx-wrapper{padding:0!important;background:transparent!important}
.docx-wrapper>section.docx{width:100%;max-width:46rem;box-sizing:border-box;box-shadow:none!important;padding:clamp(12px,4vw,28px)!important;margin:0 auto!important}
.docx-wrapper>section.docx+section.docx{border-top:1px solid #deded8}
img,table{max-width:100%} img{height:auto}</style>
<body><div id="docx-styles" hidden></div><main id="docx-content"></main></body>`

export async function readDocx(url: string, signal: AbortSignal): Promise<Uint8Array> {
  const maxBytes = 16 * 1024 * 1024
  const response = await fetch(url, { signal, credentials: 'omit' })
  if (!response.ok || Number(response.headers.get('Content-Length')) > maxBytes || !response.body) {
    await response.body?.cancel()
    throw new Error('DOCX preview unavailable')
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxBytes) throw new Error('DOCX preview size limit')
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const data = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    data.set(chunk, offset)
    offset += chunk.byteLength
  }
  return data
}
