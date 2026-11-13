<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * 双列瀑布流（小红书样式）—— 2026-07-16 v5 定稿方案
 *
 * 契约（对齐用户 2026-07-16 明确要求，写死不再改）：
 *   ① 时间顺序：items 按 time desc 顺序遍历，每张塞到当前累计高度较矮的列 →
 *      items[0] 永远左上、items[1] 永远右上（首行 = 最新 2 张）
 *   ② 底部齐整：贪心分配 → 两列累计高度差 ≤ 单张卡最大高度
 *   ③ 无抖动 / 无拉伸：
 *      - image 元素自己声明 aspect-ratio（inline style）—— cover 层不设！
 *        因为 CLAUDE.md pitfall 已写死："aspect-ratio 在 mp-weixin 上的隐含高度对
 *        子元素 height:100% 不可靠"，之前 v4 犯了这个错导致图不显示
 *      - 首次未 @load 时 image 用默认 4/3 → 立刻有可见高度 → 不会 0 高
 *      - @load 后只更新自己那张卡的 aspect-ratio（响应式），**不 re-shuffle 别的 cell**
 *        → 单卡从 4/3 变成真实比例（本地高度变化），布局不 flicker
 *   ④ 比例 clamp：真实 h/w clamp 到 [9/16, 16/9] 区间
 *      - 超横的图（如 3:1 全景）→ 裁到 16:9
 *      - 超竖的图（如 1:3 长截图）→ 裁到 9:16
 *      - 其余原样保留 → 小红书那种"高高低低"感
 *   ⑤ 多层 fallback：@error / detail 缺失 / URL 空 / 未 load 全部回落默认 4/3，
 *      保证 image 一定有可见高度、图必显示
 *   ⑥ 持久化 cache：ratio 存 uni.storage → 二次进入首帧就用真实比例分配 → 完美均衡
 *
 * 历史 v1-v4 失败记录（自警）：
 *   v1 index%2         → 顺序对但底部差 5-6 张卡
 *   v2 CSS column-count → 底齐但顺序变 [I0, I5] 而不是 [I0, I1]
 *   v3 贪心 + 估算 + debounced 重排 → UI 严重抖 + 图片拉伸
 *   v4 aspect-ratio 4/3 + aspectFill + image height:100% → 图完全不显示
 *      （CLAUDE.md aspect-ratio pitfall 早写死，我没看犯了）
 *
 * mp-weixin 说明（原有踩坑，保留）：
 *   - v-for scoped var 传 inline handler 在部分基础库上会丢 → 一律 :data-item-id 传参
 *   - 同名 slot 在 v-for 里会 warn "More than one slot named foo" → 不用 slot
 */
import { computed, reactive, ref, onMounted, watch } from "vue";
import { logger } from "@/utils/logger";
import SvgIcon from "@/components/SvgIcon.vue";

export interface MasonryItem {
  /** 唯一 key */
  id: string;
  /** 封面 URL；空时展示占位色 */
  cover_url?: string;
  /** 标题 */
  title: string;
  /** 一句话副标题（作者 / 日期 / meta）；可空 */
  subtitle?: string;
  /** 右上角角标文案（例如 相册 / 视频 / NFC UID 末 4 位）；可空 */
  badge?: string;
  /** 角标视觉档：primary(强调色) / video(红) / muted(灰) */
  badge_tone?: "primary" | "video" | "muted";
  /**
   * 2026-07-15：per-item 是否隐藏右下角三点菜单
   * - 合集卡（用户没实现菜单动作，点了没反应）→ true 隐藏
   * - 喜欢 tab 的卡片（也未接线）→ true 隐藏
   */
  hide_menu?: boolean;
}

const props = withDefaults(defineProps<{
  items: MasonryItem[];
  /** 空态提示文案 */
  empty_hint?: string;
  /** 卡片圆角 rpx（默认 24rpx） */
  radius?: number;
  /**
   * 2026-07-15：选择态（多选）
   */
  selectionMode?: boolean;
  /** 已选 id 列表（selectionMode=true 时才生效） */
  selectedIds?: string[];
}>(), {
  empty_hint: "还没有内容",
  radius: 24,
  selectionMode: false,
  selectedIds: () => [],
});

const emit = defineEmits<{
  (e: "pick", it: MasonryItem): void;
  (e: "longpress", it: MasonryItem): void;
  (e: "menu", it: MasonryItem): void;
  (e: "toggle", it: MasonryItem): void;
}>();

const selectedSet = computed(() => new Set(props.selectedIds));

// ═══════════════════════════════════════════════════════════════════════
// 常量
// ═══════════════════════════════════════════════════════════════════════
// 2026-08-11：布局稳定后关闭调试日志（用户明确要求 comment 掉图片比例 log）。
// 需要复现瀑布流问题时改回 true 即可拿到完整状态。
const MASONRY_DEBUG = false;
const _dbg = (msg: string, data?: unknown) => { if (MASONRY_DEBUG) logger.info(msg, data as never); };

const DEFAULT_RATIO = 3 / 4;   // h/w：主流 4:3 横向照片
const MIN_RATIO = 9 / 16;      // 最扁：16:9 全景（h/w = 0.5625）
const MAX_RATIO = 16 / 9;      // 最竖：9:16 竖屏（h/w = 1.7778）
const CELL_WIDTH_RPX = 340;    // 屏宽 750 - 页面 padding 24×2 - col gap 16 ≈ 340
const META_HEIGHT_RPX = 100;   // title (2 行) + subtitle 大约高度
const STORAGE_KEY = "photolio_masonry_ratio_v5";
const PERSIST_DEBOUNCE_MS = 1500;

// ═══════════════════════════════════════════════════════════════════════
// ratio cache：id → clamped h/w
// 用 reactive 让 image 的 aspect-ratio inline style 能响应式更新
// 从 uni.storage 恢复；持久化 debounced
// ═══════════════════════════════════════════════════════════════════════
const ratioMap = reactive<Record<string, number>>({});
// v5.3 诊断：上次 log 明确 persist 了 49 但重启后 cacheSize:0 —— 打详细 log 定位
try {
  const raw = uni.getStorageSync(STORAGE_KEY);
  const rawType = typeof raw;
  const isObj = raw && rawType === "object" && !Array.isArray(raw);
  const keyCount = isObj ? Object.keys(raw as Record<string, unknown>).length : 0;
  _dbg("[masonry] ratio cache read from storage", {
    key: STORAGE_KEY,
    rawType,
    rawTruthy: !!raw,
    isObject: isObj,
    keyCount,
    sample: isObj ? Object.entries(raw as Record<string, unknown>).slice(0, 3) : null,
  });
  if (isObj && keyCount > 0) {
    Object.assign(ratioMap, raw);
    _dbg("[masonry] ratio cache loaded into ratioMap", { count: Object.keys(ratioMap).length });
  } else {
    logger.warn("[masonry] ratio cache MISS (empty or wrong type)");
  }
} catch (e) {
  logger.warn("[masonry] ratio cache load THREW", e);
}

function _clampRatio(w: number, h: number): number {
  if (!w || !h || !isFinite(w) || !isFinite(h)) return DEFAULT_RATIO;
  const r = h / w;
  if (!isFinite(r)) return DEFAULT_RATIO;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));
}

// 该 item 用于渲染的 ratio；cache 命中就用，否则用默认 4/3（多层 fallback 保证不为 0）
function _ratioOf(id: string): number {
  const r = ratioMap[id];
  if (typeof r === "number" && r > 0 && isFinite(r)) return r;
  return DEFAULT_RATIO;
}

// 用 padding-top hack 撑起 cover 高度（100% 兼容 mp-weixin）：
// - padding-top 百分比参照父的 width → cover 高度 = width × ratio
// - 相比 aspect-ratio CSS 属性更稳：mp-weixin 的 <image> 是原生组件，
//   aspect-ratio 对它不生效 → v5 首版所有 image 用了默认渲染尺寸，视觉"全 9:16"
// 修法：cover 是 <view> 用 padding-top 撑高，image 走 position:absolute inset:0 撑满
function paddingTopStyle(id: string): string {
  const pct = _ratioOf(id) * 100;
  return pct.toFixed(2) + "%";
}

// ═══════════════════════════════════════════════════════════════════════
// 贪心分配：按 items 顺序遍历，每个塞到较矮列
// v5.2: 首次 cache miss 多 → 先 opacity 0 隐藏 → 等 @load 完 → re-distribute → fade in
//       cache 命中率高 → 直接显示（cache 命中率 = 已知真实 ratio 的 items 占比）
// ═══════════════════════════════════════════════════════════════════════
const leftCol = ref<MasonryItem[]>([]);
const rightCol = ref<MasonryItem[]>([]);
// isReady: masonry 是否可见（首次 cache miss 多时会先 false → 等 @load 完 → true）
const isReady = ref(true);

// v5.3：hard timeout 从 1500 → 8000ms（网速慢时 1.5s 只加载 3/49，rebalance 完全不准）
// 用 _loadedIds Set 而不是 counter：distribute 会重建 image → 同一张图触发多次 @load，
// counter 会虚高导致 threshold 提前达到 → 用 Set 去重才准
let _loadedIds = new Set<string>();
let _expectedLoads = 0;
let _finalRebalanceDone = false;
let _hardTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
const CACHE_HIT_THRESHOLD = 0.7;  // 命中率 ≥ 70% → 直接显示不隐藏
const HARD_TIMEOUT_MS = 8000;      // 图片加载最长等 8s（50 张 + 慢网也够）

function _distribute(items: readonly MasonryItem[], reason: string) {
  const left: MasonryItem[] = [];
  const right: MasonryItem[] = [];
  let leftH = 0;
  let rightH = 0;
  let cacheHits = 0;
  for (const it of items) {
    if (ratioMap[it.id] !== undefined) cacheHits++;
    const cellH = CELL_WIDTH_RPX * _ratioOf(it.id) + META_HEIGHT_RPX;
    if (leftH <= rightH) {
      left.push(it);
      leftH += cellH;
    } else {
      right.push(it);
      rightH += cellH;
    }
  }
  leftCol.value = left;
  rightCol.value = right;
  _dbg("[masonry] distribute", {
    reason,
    total: items.length,
    left: left.length,
    right: right.length,
    leftHRpx: Math.round(leftH),
    rightHRpx: Math.round(rightH),
    diffRpx: Math.round(Math.abs(leftH - rightH)),
    cacheHits,
    cacheMisses: items.length - cacheHits,
  });
}

function _tryFinalRebalance(cause: string) {
  if (_finalRebalanceDone) return;
  _finalRebalanceDone = true;
  if (_hardTimeoutTimer) { clearTimeout(_hardTimeoutTimer); _hardTimeoutTimer = null; }
  const knownCount = _loadedIds.size;
  _dbg("[masonry] final rebalance triggered", {
    cause,
    loadedIds: knownCount,
    expectedLoads: _expectedLoads,
    completeness: _expectedLoads > 0 ? (knownCount / _expectedLoads).toFixed(2) : "n/a",
  });
  _distribute(props.items, "final-rebalance");
  isReady.value = true;
}

watch(
  () => props.items,
  (v) => {
    // items 变化：reset counter / flag / timeout
    _loadedIds = new Set();
    _expectedLoads = v.filter((it) => !!it.cover_url).length;
    _finalRebalanceDone = false;
    if (_hardTimeoutTimer) { clearTimeout(_hardTimeoutTimer); _hardTimeoutTimer = null; }

    // 用当前 cache 做初始分配
    _distribute(v, "initial");

    // 决定是否 hide：cache 命中率高 → 直接显示；命中率低 → hide 等 @load 完
    const withCover = _expectedLoads;
    const hits = v.filter((it) => it.cover_url && ratioMap[it.id] !== undefined).length;
    const hitRate = withCover > 0 ? hits / withCover : 1;
    const shouldHide = withCover > 0 && hitRate < CACHE_HIT_THRESHOLD;

    _dbg("[masonry] items changed", {
      total: v.length,
      withCover,
      cacheHitRate: hitRate.toFixed(2),
      willHideAndWait: shouldHide,
    });

    if (shouldHide) {
      isReady.value = false;
      // hard timeout 兜底：图片 hang 时也不能让用户白等
      _hardTimeoutTimer = setTimeout(() => {
        // 2026-09-14：这里原本写的是 `_loadedCount`，**这个变量根本不存在** ——
        // 真实变量是 `_loadedIds`（Set，见 _bumpLoadedAndMaybeRebalance）。
        // 结果：首屏 cache miss 多时走 shouldHide 分支，1.5s hard timeout 一到
        // 就抛 `ReferenceError: _loadedCount is not defined`，回调直接中断 →
        // `_tryFinalRebalance` 永远不执行 → isReady 卡在 false → 瀑布流不显示、
        // 页面高度算不出来（连带底栏位置飘）。用户控制台实测到这个 Uncaught。
        logger.warn("[masonry] hard timeout reached, force show", {
          loadedCount: _loadedIds.size,
          expectedLoads: _expectedLoads,
        });
        _tryFinalRebalance("hard-timeout");
      }, HARD_TIMEOUT_MS);
    } else {
      // 命中率高 → 认为已足够均衡，标记完成不再 rebalance
      _finalRebalanceDone = true;
      isReady.value = true;
    }
  },
  { immediate: true, deep: false },
);

// ═══════════════════════════════════════════════════════════════════════
// image @load: 拿真实宽高 → clamp → 写 ratioMap → 只影响该 cell 自身高度
// 不 re-distribute！避免 UI 抖。下次 items 变化时才用新 ratio 重算分配
// ═══════════════════════════════════════════════════════════════════════
let _persistTimer: ReturnType<typeof setTimeout> | null = null;
function _schedulePersist() {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    try {
      uni.setStorageSync(STORAGE_KEY, { ...ratioMap });
      _dbg("[masonry] ratio cache persisted", { count: Object.keys(ratioMap).length });
    } catch (e) {
      logger.warn("[masonry] ratio cache persist failed", e);
    }
  }, PERSIST_DEBOUNCE_MS);
}

function _bumpLoadedAndMaybeRebalance(id: string) {
  if (id) _loadedIds.add(id);   // Set 去重：distribute 重建 image 会二次 @load，counter 会虚高
  if (!_finalRebalanceDone && _loadedIds.size >= _expectedLoads && _expectedLoads > 0) {
    _tryFinalRebalance("all-loaded");
  }
}

function _onCoverLoad(e: unknown) {
  const ev = e as {
    detail?: { width?: number; height?: number };
    currentTarget?: { dataset?: { itemId?: string } };
  };
  const id = ev?.currentTarget?.dataset?.itemId || "";
  if (!id) {
    logger.warn("[masonry] cover @load without dataset itemId", ev);
    _bumpLoadedAndMaybeRebalance(id);  // 仍算作 loaded，避免 hard timeout 才触发
    return;
  }
  const w = Number(ev?.detail?.width || 0);
  const h = Number(ev?.detail?.height || 0);
  if (!w || !h) {
    logger.warn("[masonry] cover @load with 0 dims (fallback to default)", { id, w, h });
    _bumpLoadedAndMaybeRebalance(id);
    return;
  }
  const raw = h / w;
  const clamped = _clampRatio(w, h);
  const wasClamped = Math.abs(raw - clamped) > 0.001;
  const prev = ratioMap[id];
  ratioMap[id] = clamped;
  _dbg("[masonry] cover @load", {
    id,
    imgW: w,
    imgH: h,
    rawRatio: raw.toFixed(3),
    clampedRatio: clamped.toFixed(3),
    wasClamped,
    prevRatio: prev !== undefined ? prev.toFixed(3) : "(none)",
    cellHRpx: Math.round(CELL_WIDTH_RPX * clamped + META_HEIGHT_RPX),
  });
  _schedulePersist();
  _bumpLoadedAndMaybeRebalance(id);
}

function _onCoverError(e: unknown) {
  const ev = e as { currentTarget?: { dataset?: { itemId?: string } }; detail?: unknown };
  const id = ev?.currentTarget?.dataset?.itemId || "";
  logger.warn("[masonry] cover @error (fallback to default ratio)", { id: id || "(unknown)", detail: ev?.detail });
  // 不改 ratioMap，保持 DEFAULT_RATIO 显示占位色；但仍算作 loaded 推进 rebalance
  _bumpLoadedAndMaybeRebalance(id);
}

// ═══════════════════════════════════════════════════════════════════════
// 交互事件
// ═══════════════════════════════════════════════════════════════════════
let _justLongPressed = false;
let _lpTimer: ReturnType<typeof setTimeout> | null = null;

function _resolveItem(e: unknown): MasonryItem | null {
  const ev = e as { currentTarget?: { dataset?: { itemId?: string } } };
  const id = ev?.currentTarget?.dataset?.itemId;
  if (!id) return null;
  return props.items.find((x) => x.id === id) || null;
}

function _onLongPress(e: TouchEvent) {
  const it = _resolveItem(e);
  if (!it) return;
  _justLongPressed = true;
  if (_lpTimer) clearTimeout(_lpTimer);
  _lpTimer = setTimeout(() => { _justLongPressed = false; }, 400);
  emit("longpress", it);
}
function _onTap(e: TouchEvent) {
  if (_justLongPressed) return;
  const it = _resolveItem(e);
  if (!it) return;
  if (props.selectionMode) {
    emit("toggle", it);
    return;
  }
  emit("pick", it);
}
function _onMenu(e: TouchEvent) {
  const ev = e as unknown as { stopPropagation?: () => void; currentTarget?: { dataset?: { itemId?: string } } };
  ev.stopPropagation?.();
  const id = ev.currentTarget?.dataset?.itemId;
  if (!id) return;
  const it = props.items.find((x) => x.id === id);
  if (it) emit("menu", it);
}

// ═══════════════════════════════════════════════════════════════════════
// 挂载诊断日志（未来任何"图不显示 / 顺序错 / UI 抖"都可从这里追溯）
// ═══════════════════════════════════════════════════════════════════════
onMounted(() => {
  const withCover = props.items.filter((it) => !!it.cover_url).length;
  _dbg("[masonry] mounted", {
    totalItems: props.items.length,
    withCover,
    withoutCover: props.items.length - withCover,
    cacheSize: Object.keys(ratioMap).length,
    firstItemId: props.items[0]?.id || "(none)",
    firstCover: props.items[0]?.cover_url || "(none)",
    defaultRatio: DEFAULT_RATIO.toFixed(3),
    clampRange: `[${MIN_RATIO.toFixed(3)}, ${MAX_RATIO.toFixed(3)}]`,
  });
});
</script>

<template>
  <view v-if="items.length === 0" class="empty">
    <text>{{ empty_hint }}</text>
  </view>
  <view v-else class="masonry" :class="{ 'masonry-hidden': !isReady }">
    <!-- 左列 -->
    <view class="col">
      <view
        v-for="it in leftCol"
        :key="it.id"
        class="cell"
        :style="{ borderRadius: (radius + 'rpx') }"
        hover-class="cell-hover"
        :hover-stay-time="80"
        :data-item-id="it.id"
        @click="_onTap"
        @longpress="_onLongPress"
      >
        <view
          class="cover"
          :style="{ borderRadius: (radius + 'rpx'), paddingTop: paddingTopStyle(it.id) }"
        >
          <image
            v-if="it.cover_url"
            :src="it.cover_url"
            mode="aspectFill"
            class="cover-img"
            :data-item-id="it.id"
            @load="_onCoverLoad"
            @error="_onCoverError"
          />
          <view v-else class="cover-placeholder">
            <text>{{ (it.title || uiText("画")).charAt(0) }}</text>
          </view>
          <view
            v-if="it.badge"
            class="badge"
            :class="'badge-' + (it.badge_tone || 'primary')"
          ><text>{{ it.badge }}</text></view>
        </view>
        <view class="meta">
          <text class="title">{{ it.title || uiText("未命名") }}</text>
          <text v-if="it.subtitle" class="subtitle">{{ it.subtitle }}</text>
        </view>
        <view v-if="selectionMode" class="sel-check" :class="{ on: selectedSet.has(it.id) }">
          <SvgIcon v-if="selectedSet.has(it.id)" name="check" size="24rpx" color="#F7F3EE" />
        </view>
        <view
          v-else-if="!it.hide_menu"
          class="menu-btn"
          :data-item-id="it.id"
          hover-class="menu-btn-hover"
          catchtap="1"
          @click.stop="_onMenu"
        >
          <text class="menu-dots">•••</text>
        </view>
      </view>
    </view>
    <!-- 右列 -->
    <view class="col">
      <view
        v-for="it in rightCol"
        :key="it.id"
        class="cell"
        :style="{ borderRadius: (radius + 'rpx') }"
        hover-class="cell-hover"
        :hover-stay-time="80"
        :data-item-id="it.id"
        @click="_onTap"
        @longpress="_onLongPress"
      >
        <view
          class="cover"
          :style="{ borderRadius: (radius + 'rpx'), paddingTop: paddingTopStyle(it.id) }"
        >
          <image
            v-if="it.cover_url"
            :src="it.cover_url"
            mode="aspectFill"
            class="cover-img"
            :data-item-id="it.id"
            @load="_onCoverLoad"
            @error="_onCoverError"
          />
          <view v-else class="cover-placeholder">
            <text>{{ (it.title || uiText("画")).charAt(0) }}</text>
          </view>
          <view
            v-if="it.badge"
            class="badge"
            :class="'badge-' + (it.badge_tone || 'primary')"
          ><text>{{ it.badge }}</text></view>
        </view>
        <view class="meta">
          <text class="title">{{ it.title || uiText("未命名") }}</text>
          <text v-if="it.subtitle" class="subtitle">{{ it.subtitle }}</text>
        </view>
        <view v-if="selectionMode" class="sel-check" :class="{ on: selectedSet.has(it.id) }">
          <SvgIcon v-if="selectedSet.has(it.id)" name="check" size="24rpx" color="#F7F3EE" />
        </view>
        <view
          v-else-if="!it.hide_menu"
          class="menu-btn"
          :data-item-id="it.id"
          hover-class="menu-btn-hover"
          catchtap="1"
          @click.stop="_onMenu"
        >
          <text class="menu-dots">•••</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.empty {
  padding: t.$spacing-6 t.$spacing-4;
  text-align: center;
  color: t.$color-text-mute;
  font-size: t.$font-sm;
}

// 2026-07-16 v5 双列 flex：手动 leftCol/rightCol 已按贪心分好，这里只做水平并排
.masonry {
  display: flex;
  flex-direction: row;
  gap: t.$spacing-2;
  align-items: flex-start;
  // v5.2: 首次 cache miss 多时会先隐藏 → 等 @load 完 → 淡入完美布局
  //   image 走 opacity 0 也会加载（原生组件），不影响资源请求
  opacity: 1;
  transition: opacity 0.3s ease-out;
}
.masonry-hidden {
  opacity: 0;
}
.col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: t.$spacing-2;
  min-width: 0;
}
.cell {
  position: relative;
  background: t.$color-surface;
  overflow: hidden;
  box-shadow: 0 4rpx 16rpx rgba(61, 46, 31, 0.08);
  display: flex;
  flex-direction: column;
}
.cell-hover { opacity: 0.85; }

// 2026-07-16 v5.1 关键：cover 用 **padding-top hack** 撑高（不用 aspect-ratio）
//   - mp-weixin <image> 是原生组件（同层渲染），CSS aspect-ratio 对它不生效
//     → v5 首版把 aspect-ratio 给 image → 视觉"全 9:16"（image 用默认渲染尺寸）
//   - 移到 <view> cover 上，用 padding-top 百分比（相对父 width）撑起高度
//     → 100% 兼容 mp-weixin 各版本，view 是普通节点 CSS 全支持
//   - image 用 position:absolute inset:0 撑满 cover 内框
.cover {
  position: relative;    // 让内部 absolute image 定位到 cover 内
  width: 100%;
  height: 0;             // 高度靠 padding-top 撑
  // padding-top 走 inline style，动态百分比 = ratio × 100%
  overflow: hidden;
  background: #F0EAE0;
}
.cover-img {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  width: 100%;
  height: 100%;          // 撑满 cover 内框（absolute + inset → 高度可靠）
}
.cover-placeholder {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 96rpx;
  font-weight: t.$weight-bold;
  color: rgba(61, 46, 31, 0.35);
}

.badge {
  position: absolute;
  top: 12rpx; left: 12rpx;
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
  font-weight: t.$weight-bold;
  color: t.$color-text-invert;
  backdrop-filter: blur(6rpx);
}
.badge-primary { background: rgba(61, 46, 31, 0.85); }
.badge-video   { background: rgba(196, 74, 74, 0.85); }
.badge-muted   { background: rgba(168, 154, 138, 0.85); }

.meta {
  padding: 16rpx 20rpx 20rpx;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.title {
  font-size: 28rpx;
  font-weight: t.$weight-bold;
  color: t.$color-text;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.subtitle {
  font-size: 22rpx;
  color: t.$color-text-mute;
  line-height: 1.3;
}

// 右下角三点菜单
.menu-btn {
  position: absolute;
  right: 4rpx;
  bottom: 4rpx;
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
}
.menu-btn-hover .menu-dots {
  color: rgba(0, 0, 0, 0.75);
}
.menu-dots {
  font-size: 20rpx;
  color: rgba(0, 0, 0, 0.55);
  line-height: 1;
  letter-spacing: 1rpx;
  font-weight: t.$weight-bold;
}

// 选择态 checkbox（右上角）
.sel-check {
  position: absolute;
  top: 12rpx;
  right: 12rpx;
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  border: 2rpx solid t.$color-border;
  display: flex;
  align-items: center;
  justify-content: center;
  color: t.$color-text-invert;
  font-size: 28rpx;
  font-weight: t.$weight-bold;
}
.sel-check.on {
  background: t.$color-accent;
  border-color: t.$color-accent;
  color: t.$color-text-invert;
}
</style>
