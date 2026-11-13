import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

export function openPdf(url: string) {
  const assets = import.meta.env.DEV ? '/node_modules/pdfjs-dist/' : import.meta.env.BASE_URL + 'pdf-preview/'
  return getDocument({
    url, isEvalSupported: false,
    cMapUrl: assets + 'cmaps/', cMapPacked: true,
    standardFontDataUrl: assets + 'standard_fonts/', wasmUrl: assets + 'wasm/',
  })
}
