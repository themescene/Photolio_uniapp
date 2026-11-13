/**
 * 视频卡顿检测（2026-07-13 新增）
 *
 * 规格来自用户 2026-07-13 需求：
 *   > 全局加一个如果检测到播放卡顿（比如说一个视频出现了 5 次播放卡顿）就提示
 *   > 该视频较大，建议下载到本地相册播放
 *
 * 实现方式：
 *   mp-weixin 的 <video> 组件有以下事件可用：
 *     - @waiting  播放开始等待缓冲（"卡顿"信号）
 *     - @playing  重新恢复播放
 *     - @error    播放失败
 *   同一 videoUrl 累计 5 次 waiting 就触发一次 uni.showModal 建议下载；
 *   同一 URL 只提示一次（用 promptedForUrl 缓存）。
 *
 * 使用方式（挂到组件里，视频 URL 是 ref/getter）：
 *   const { onWaiting, onPlaying, onError } = useVideoStallDetector(() => currentVideoUrl.value)
 *   <video @waiting="onWaiting" @playing="onPlaying" @error="onError" />
 */
import { logger } from "@/utils/logger";

interface Options {
  threshold?: number;
  /** 提示副本；覆盖默认 */
  hintText?: string;
  onStallLimit?: (url: string) => void;
}

// 跨组件的两个全局态：counts 记同一 URL 累计次数；promptedForUrl 记已提示过的
const globalStallCounts = new Map<string, number>();
const promptedForUrl = new Set<string>();

type UrlGetter = () => string | undefined | null;

export function useVideoStallDetector(getUrl: UrlGetter, opts: Options = {}) {
  const threshold = opts.threshold ?? 5;

  function onWaiting() {
    const url = (getUrl() || "").trim();
    if (!url) return;
    const count = (globalStallCounts.get(url) || 0) + 1;
    globalStallCounts.set(url, count);
    logger.info("[stall-detector] waiting", {
      url: url.slice(-40),
      count,
      threshold,
    });
    if (count >= threshold && !promptedForUrl.has(url)) {
      promptedForUrl.add(url);
      const hint = opts.hintText || "视频较大，建议下载到本地相册后播放会更流畅";
      uni.showModal({
        title: "视频加载不太顺畅",
        content: hint,
        showCancel: false,
        confirmText: "知道了",
      });
      opts.onStallLimit?.(url);
    }
  }

  function onPlaying() {
    // playing 不清零：「累计 5 次」不是「连续 5 次」，这与用户需求原文一致
  }

  function onError(e: unknown) {
    const url = (getUrl() || "").trim();
    logger.warn("[stall-detector] video error", { url: url.slice(-40), e });
  }

  function resetForCurrent() {
    const url = (getUrl() || "").trim();
    if (url) globalStallCounts.delete(url);
  }

  return { onWaiting, onPlaying, onError, resetForCurrent };
}

/** 全局清空（测试用；生产不用调） */
export function _resetPromptedCache() {
  promptedForUrl.clear();
  globalStallCounts.clear();
}
