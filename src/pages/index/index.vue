<script setup lang="ts">
import { displayContentTitle, mediaKind } from "@/features/nfc/content";
import { t as uiText, locale } from "@/i18n";
/**
 * 画匣子主页 —— 三 tab 版。
 *
 * 参考：annualreport/src/views/UploadView.vue HOME 状态 (line 1570-1768)
 * tabs: personal / liked / groups
 *
 * 2026-07-03 移除「动态」tab（原 NFC preset 管理），单用户走 NFC 页 + 长按快捷入口即可，
 * 批量烧卡走独立的 dev/nfc-burn 页面
 */
import { ref, computed, onMounted, onUnmounted } from "vue";
import { onShow, onShareAppMessage, onPullDownRefresh } from "@dcloudio/uni-app";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/stores/auth";
import * as shareApi from "@/api/share";
import { updateShare, beginEdit, endEdit, autoTitleShare } from "@/api/share";
import { fetchMyGroups, fetchGroupMemories, leaveGroup, renameGroup } from "@/api/group";
import { ApiError } from "@/api/request";
import { logger } from "@/utils/logger";
import BrandHeader from "@/components/BrandHeader.vue";
import ShareGrid from "@/components/ShareGrid.vue";
import GroupFolderCard from "@/components/GroupFolderCard.vue";
import CustomTabBar from "@/components/CustomTabBar.vue";
import MasonryFeed, { type MasonryItem } from "@/components/MasonryFeed.vue";
import { STATIC_BASE } from "@/config/env";
import type { ShareListItem, GroupInfo } from "@/types";

// 「动态」tab（NFC preset 管理）是网页版残留：单用户已经通过 NFC tab 完成绑定，
// 批量烧卡走独立的 [pages/dev/nfc-burn.vue]。用户明确要求去掉此 tab
type HomeTab = "personal" | "liked" | "groups";

const TABS: { key: HomeTab; label: string }[] = [
  { key: "personal", label: "我的" },
  { key: "liked", label: "喜欢" },
  { key: "groups", label: "合集" },
];

const activeTab = ref<HomeTab>("personal");

const auth = useAuthStore();
const { isLoggedIn, user } = storeToRefs(auth);

// 用户已用微信登录，但还没绑定旧账号 → 显示「绑定旧账号」兜底入口
const canBindLegacy = computed(() => isLoggedIn.value && !user.value?.linked_legacy_user_id);

function gotoBindLegacy() {
  uni.navigateTo({ url: "/pages/account/settings" });
}

// 2026-09-15 v6：bg 图轮播（10s 一切换）。放在 `public/bg/` 下（Vite publicDir，
// 只 H5 build 会 copy 到 dist，mp-weixin 编译器不认 → 天然只进 h5 包。
// 之前放 src/static/bg/ 时被 uni-app 自动打包进 mp-weixin 主包，1.7MB 让主包爆 2MB
// 上限 → 上传体验版失败（用户 2026-09-15 21:56 实测）。
const bgImages = [
  "/bg/bg1.jpg",
  "/bg/bg2.jpg",
  "/bg/bg3.jpg",
];
const currentBgIndex = ref(0);
let _bgTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  // #ifdef H5
  _bgTimer = setInterval(() => {
    currentBgIndex.value = (currentBgIndex.value + 1) % bgImages.length;
  }, 10_000);
  // #endif
});
onUnmounted(() => {
  if (_bgTimer) { clearInterval(_bgTimer); _bgTimer = null; }
});

// 2026-09-15：首页右上角 2 按钮（H5 only）
// - 关于：/about.html（switch-hxiazi-to-h5.sh 已把老 about.html + about/ 目录搬到新根）
// - 旧版：走 old.hxiazi.com 子域名（不用 /old/ 前缀 —— 老 vue 用 root-relative
//   asset 路径 /assets/xxx.js，前缀方案会跟新 h5 的 assets 撞车。详见 OPS.md）
function onOpenAbout() {
  // #ifdef H5
  const w = globalThis as unknown as { location?: { href: string } };
  if (w.location) w.location.href = "/about.html";
  // #endif
}
function onOpenLegacy() {
  // #ifdef H5
  const w = globalThis as unknown as { location?: { href: string } };
  if (w.location) w.location.href = "https://old.hxiazi.com/";
  // #endif
}

// —— Personal ——
const personalShares = ref<ShareListItem[]>([]);
// —— Liked ——
const likedShares = ref<ShareListItem[]>([]);
// —— Groups（画匣子集合） ——
const groups = ref<GroupInfo[]>([]);

const loading = ref(false);
const errorMsg = ref("");

// Tab 缓存：每个 tab 只在首次进入 / 显式刷新时拉取，避免 onShow 反复重载。
// 创建 / 删除 / 解绑等 mutation 会在本地直接改 state，不需要重新拉。
const loadedTabs = new Set<HomeTab>();

// 「我的画匣子」混排：个人画匣子 + 满足 is_solo || has_personal_pinned 的集合，按时间倒序
// 对齐网页端 UploadView.vue:182-194 personalItems
type PersonalItem =
  | { type: "share"; data: ShareListItem; time: string }
  | { type: "folder"; data: GroupInfo; time: string };

const personalItems = computed<PersonalItem[]>(() => {
  const items: PersonalItem[] = [];
  for (const s of personalShares.value) {
    items.push({ type: "share", data: s, time: s.created_at || "" });
  }
  for (const g of groups.value) {
    if (g.is_solo || g.has_personal_pinned) {
      items.push({ type: "folder", data: g, time: g.latest_created_at || "" });
    }
  }
  items.sort((a, b) => b.time.localeCompare(a.time));
  return items;
});

// 2026-07-13：映射为瀑布流卡片
function _resolveCover(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  if (url.startsWith("/")) return `${STATIC_BASE}${url}`;
  return url;
}
const personalMasonry = computed<MasonryItem[]>(() => {
  return personalItems.value.map((it, idx) => {
    if (it.type === "share") {
      const s = it.data;
      return {
        id: `share:${s.share_id}`,
        cover_url: mediaKind(s.report_title || "") === "file" ? "" : _resolveCover(s.cover_image),
        title: displayContentTitle(s.report_title || uiText("未命名")),
        subtitle: (s.created_at || "").slice(0, 10),
        badge: s.share_type === "album" ? uiText("相册") : "",
        badge_tone: s.share_type === "album" ? "primary" : undefined,
      } as MasonryItem;
    }
    const g = it.data;
    const gname = (!g.group_name || g.group_name === g.group_id) ? "合集" : g.group_name;
    return {
      id: `group:${g.group_id}`,
      cover_url: _resolveCover(g.cover_url),
      title: gname,
      subtitle: `${g.member_count ?? 1} 个章节`,
      badge: uiText("合集"),
      badge_tone: "muted",
      // 2026-07-15：合集卡的菜单动作未接线（点了没反应），先隐藏；后续要加就把这里删掉
      hide_menu: true,
    } as MasonryItem;
  });
});
const likedMasonry = computed<MasonryItem[]>(() =>
  likedShares.value.map((s) => ({
    id: `like:${s.share_id}`,
    cover_url: mediaKind(s.report_title || "") === "file" ? "" : _resolveCover(s.cover_image),
    title: displayContentTitle(s.report_title || uiText("未命名")),
    subtitle: (s.created_at || "").slice(0, 10),
    badge: s.share_type === "album" ? uiText("相册") : "",
    badge_tone: s.share_type === "album" ? "primary" : undefined,
    // 2026-07-15：喜欢 tab 也没接菜单动作；先隐藏三点
    hide_menu: true,
  })),
);
// pick handler：从 MasonryItem.id 解析类型 + share_id/group_id 分流
function onPickPersonalMasonry(it: MasonryItem) {
  const [kind, rawId] = it.id.split(":");
  // trailing suffix idx 已经追加过，解析时 id 只保留冒号后到第二个冒号（如 share:xxx:0 → 取 xxx）
  const realId = rawId;
  if (kind === "share") {
    const s = personalShares.value.find((x) => x.share_id === realId);
    if (s) openShare(s);
    else uni.showToast({ title: "未找到画匣子", icon: "none" });
  } else if (kind === "group") {
    const g = groups.value.find((x) => x.group_id === realId);
    if (g) onOpenGroup(g);
    else uni.showToast({ title: "未找到合集", icon: "none" });
  }
}
function onLongPressPersonalMasonry(it: MasonryItem) {
  if (!it?.id) return;
  const [kind, rawId] = it.id.split(":");
  if (kind !== "share") return;
  const s = personalShares.value.find((x) => x.share_id === rawId);
  if (s) onLongPressShare(s);
}
// 2026-07-15：三点菜单按钮点击 —— 与长按等效
function onMenuPersonalMasonry(it: MasonryItem) {
  onLongPressPersonalMasonry(it);
}
function onPickLikedMasonry(it: MasonryItem) {
  if (!it?.id) return;
  const [, rawId] = it.id.split(":");
  const s = likedShares.value.find((x) => x.share_id === rawId);
  if (s) openShare(s);
}
// 2026-08-11：长按"喜欢"卡片 → 弹出取消喜欢的 modal（Bug 2 用户视觉入口）
function onLongPressLikedMasonry(it: MasonryItem) {
  if (!it?.id) return;
  const [, rawId] = it.id.split(":");
  const s = likedShares.value.find((x) => x.share_id === rawId);
  if (!s) return;
  uni.showModal({
    title: "取消喜欢？",
    content: `将「${s.report_title || "未命名"}」从"喜欢"里移除`,
    confirmText: "取消喜欢",
    cancelText: "留着",
    success: (r) => { if (r.confirm) onUnlikeShare(s); },
  });
}
// 2026-07-15：多选态 —— 从长按菜单进入
const selectionMode = ref(false);
const selectedIds = ref<string[]>([]);
function enterSelectionWith(item: ShareListItem) {
  selectionMode.value = true;
  selectedIds.value = [`share:${item.share_id}`];
}
function onTogglePersonalMasonry(it: MasonryItem) {
  if (!it?.id) return;
  const set = new Set(selectedIds.value);
  if (set.has(it.id)) set.delete(it.id);
  else set.add(it.id);
  selectedIds.value = Array.from(set);
}
function exitSelection() {
  selectionMode.value = false;
  selectedIds.value = [];
}
function selectAllPersonal() {
  if (selectedIds.value.length === personalMasonry.value.length) {
    // 已全选 → 全不选
    selectedIds.value = [];
  } else {
    selectedIds.value = personalMasonry.value.map((it) => it.id);
  }
}
async function deleteSelectedPersonal() {
  const ids = selectedIds.value.slice();
  if (ids.length === 0) return;
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: `删除 ${ids.length} 项？`,
      content: "删除后无法恢复。合集会移出你的部分（其它成员章节保留）",
      confirmText: "全部删除",
      confirmColor: "#C13939",
      success: (r) => resolve(r.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;
  uni.showLoading({ title: "删除中…", mask: true });
  let ok = 0;
  let fail = 0;
  for (const id of ids) {
    const [kind, rawId] = id.split(":");
    try {
      if (kind === "share") {
        await shareApi.deleteShare(rawId);
        personalShares.value = personalShares.value.filter((s) => s.share_id !== rawId);
      } else if (kind === "group") {
        // 合集：走既有的 leaveGroup 循环解绑（onDeleteGroup 逻辑）
        const g = groups.value.find((x) => x.group_id === rawId);
        if (g) {
          const r = await fetchGroupMemories(g.group_id);
          const list = r.memories || [];
          await Promise.all(list.map((m) =>
            leaveGroup(m.share_id).catch(() => { /* ignore */ }),
          ));
          groups.value = groups.value.filter((x) => x.group_id !== rawId);
        }
      }
      ok++;
    } catch (e) {
      logger.warn("[home] batch delete one failed", { id, e });
      fail++;
    }
  }
  uni.hideLoading();
  if (fail === 0) uni.showToast({ title: `已删除 ${ok} 项`, icon: "success" });
  else uni.showToast({ title: `${ok} 成 · ${fail} 失`, icon: "none", duration: 2500 });
  exitSelection();
}

const currentEmpty = computed(() => {
  switch (activeTab.value) {
    case "personal": return personalItems.value.length === 0;
    case "liked":    return likedShares.value.length === 0;
    case "groups":   return groups.value.length === 0;
  }
  return true;
});

async function loadByTab(tab: HomeTab, force = false) {
  if (!isLoggedIn.value) return;
  // 已加载过且无需强制刷新 → 直接 noop（解决用户「每次回首页都加载」反馈）
  if (!force && loadedTabs.has(tab)) return;
  loading.value = true;
  errorMsg.value = "";
  try {
    if (tab === "personal") {
      // personal 是混排：同时加载个人画匣子 + 集合，集合用 is_solo/has_personal_pinned 过滤
      const [shareRes, groupRes] = await Promise.all([
        shareApi.fetchMyShares("personal"),
        fetchMyGroups().catch(() => ({ groups: [] as GroupInfo[] })),
      ]);
      personalShares.value = shareRes.shares || [];
      groups.value = groupRes.groups || [];
    } else if (tab === "liked") {
      const r = await shareApi.fetchMyShares("liked");
      likedShares.value = r.shares || [];
    } else if (tab === "groups") {
      const r = await fetchMyGroups();
      groups.value = r.groups || [];
    }
    loadedTabs.add(tab);
  } catch (e) {
    errorMsg.value = e instanceof ApiError ? e.message : "加载失败";
    logger.warn("[home] load tab failed", tab, e);
  } finally {
    loading.value = false;
  }
}

// 主动刷新当前 tab（下拉刷新 / 用户从其他页面回来想看最新数据）
function refreshActiveTab() {
  // personal 是混合数据 → 同时清掉 groups 缓存
  if (activeTab.value === "personal") loadedTabs.delete("groups");
  loadByTab(activeTab.value, true);
}

function switchTab(t: HomeTab) {
  if (t === activeTab.value) return;
  activeTab.value = t;
  loadByTab(t);
}

// touch swipe to switch tabs —— 2026-07-14 用户反馈「太容易误触了」，判定改严：
//   1) 位移阈值 60 → 100（约 50px；正常滑动瀑布流的横向抖动一般 <30）
//   2) 方向比：横向位移必须 ≥ 纵向位移 × 2（真横滑才生效；纯上下滑不动 tab）
//   3) 速度门槛：耗时 > 600ms 认为是"慢滑翻内容"，不触发；快速手势才切
//   4) 起始点若在 x <=40px（微信右滑返回手势区），忽略避免与系统返回手势冲突
let touchX = 0;
let touchY = 0;
let touchStartTs = 0;
function onTouchStart(e: TouchEvent) {
  const t = e.touches[0];
  touchX = t?.clientX || 0;
  touchY = t?.clientY || 0;
  touchStartTs = Date.now();
}
function onTouchEnd(e: TouchEvent) {
  const ct = e.changedTouches[0];
  const dx = (ct?.clientX || 0) - touchX;
  const dy = (ct?.clientY || 0) - touchY;
  const dt = Date.now() - touchStartTs;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  // 1) 位移
  if (adx < 100) return;
  // 2) 方向比：横向必须显著大于纵向；避免瀑布流上下滑意外切 tab
  if (adx < ady * 2) return;
  // 3) 速度：太慢当作阅读性滑动
  if (dt > 600) return;
  // 4) 微信右滑返回手势区（屏幕最左侧 40px 起始）→ 让给系统
  if (touchX < 40) return;
  const i = TABS.findIndex((t) => t.key === activeTab.value);
  if (dx < 0 && i < TABS.length - 1) switchTab(TABS[i + 1].key);
  if (dx > 0 && i > 0) switchTab(TABS[i - 1].key);
}

function gotoLogin() { uni.navigateTo({ url: "/pages/auth/login" }); }
function gotoCreate() { uni.navigateTo({ url: "/pages/create/index" }); }

function openShare(item: ShareListItem) {
  if (!item?.share_id) return;
  // 2026-07-13：相册模式的 share 点击后应进 album/index 而不是 share/play
  // （share/play 不认识相册模式的 media 列表，会显示成空模板）
  const target = item.share_type === 'album'
    ? `/pages/album/index?id=${encodeURIComponent(item.share_id)}`
    : `/pages/share/play?id=${encodeURIComponent(item.share_id)}`;
  uni.navigateTo({ url: target });
}

// ShareGrid 的「分享」按钮已经是 <button open-type=share>，点击会触发
// onShareAppMessage（下面定义）；这里事件回调只用于埋点 / 兜底提示
function onShareCopy(_item: ShareListItem) {
  // 微信原生分享面板会自动出现；此处不需要复制链接
}

// 微信原生分享：点 ShareGrid / GroupFolderCard 卡的分享按钮 / 右上胶囊菜单 → 都走这里
onShareAppMessage((res) => {
  // res.from === 'button' 时，res.target.dataset 带着我们在子组件里塞的 share-id / group-id
  const ds = ((res as { target?: { dataset?: Record<string, string> } }).target?.dataset) || {};
  const shareId = ds.shareId || "";
  const groupId = ds.groupId || "";
  if (shareId) {
    return {
      title: ds.shareTitle || "画匣子",
      path: `/pages/share/play?id=${encodeURIComponent(shareId)}`,
      imageUrl: ds.shareCover || "",
    };
  }
  if (groupId) {
    // 集合（合集）分享：跳进集合详情页，接收方可逐章翻阅
    const name = ds.groupName || "合集";
    return {
      title: `「${name}」· 一份共同回忆`,
      path: `/pages/group/index?id=${encodeURIComponent(groupId)}&name=${encodeURIComponent(name)}`,
      imageUrl: ds.groupCover || "",
    };
  }
  // 兜底：分享主页
  return {
    title: "画匣子 · 把生活封进卡片",
    path: "/pages/index/index",
  };
});

// 长按画匣子卡：弹快捷菜单（重命名 / 置顶 / 喜欢 / 删除）
// 编辑页的重命名入口较深，用户明确要求首页加快捷入口
// 2026-07-14 用户反馈"删除按钮没了" —— 改瀑布流后 ShareGrid actions bar 消失，删除入口只剩长按菜单
function onLongPressShare(item: ShareListItem) {
  const pinned = !!item.personal_pinned;
  // 2026-07-15：加「多选」入口，让用户可以在瀑布流里批量操作
  // 2026-09-14：加「智能标题」。保存时的 AI 自动起名已按用户契约默认关闭
  // （默认不识图、不 AI 起名），这里是它唯一的显式入口 —— 用户想要才点。
  const actions = [
    "重命名", "智能标题",
    pinned ? "取消置顶" : "置顶", "加入喜欢", "多选", "删除",
  ];
  uni.showActionSheet({
    itemList: actions,
    success: async (res) => {
      if (res.tapIndex === 0) return promptRename(item);
      if (res.tapIndex === 1) return smartTitleShare(item);
      if (res.tapIndex === 2) return togglePinShare(item, !pinned);
      if (res.tapIndex === 3) return likeShareItem(item);
      if (res.tapIndex === 4) return enterSelectionWith(item);
      if (res.tapIndex === 5) return onDeleteShare(item);
    },
  });
}

/** 2026-09-14：智能标题 —— 后端用首图/正文生成标题并回写，前端就地刷新卡片 */
async function smartTitleShare(item: ShareListItem) {
  uni.showLoading({ title: "正在起标题…", mask: true });
  try {
    const r = await autoTitleShare(item.share_id);
    uni.hideLoading();
    const t = (r?.report_title || "").trim();
    if (!t) {
      uni.showToast({ title: "没找到合适的标题，保持原样", icon: "none", duration: 2500 });
      return;
    }
    item.report_title = t;
    uni.showToast({ title: `已改名：${t}`, icon: "none", duration: 2500 });
  } catch (e) {
    uni.hideLoading();
    logger.warn("[index] 智能标题失败", e);
    uni.showToast({
      title: e instanceof ApiError ? e.message : "起标题失败，请重试",
      icon: "none", duration: 3000,
    });
  }
}

async function likeShareItem(item: ShareListItem) {
  // 2026-07-15 用户明确反驳"自己创建的也得能加入喜欢"——去掉 owner 拦截。
  // backend save-to-collection 会把 owner 加进 editors；但 backend get_user_shares?type=liked
  // 过滤掉 owner 自己，所以「喜欢」tab 依然看不到。这里改成向用户明确说明"已加，喜欢 tab 保留给他人分享"
  // （后端过滤逻辑可以另行调整让 owner 也能在喜欢 tab 看到自己的，那是 backend 侧的独立决策）
  try {
    const r = await shareApi.likeShare(item.share_id);
    if (r?.already_saved) {
      uni.showToast({ title: "已在喜欢里", icon: "none" });
    } else {
      uni.showToast({ title: "已加入喜欢", icon: "success" });
      loadedTabs.delete("liked");
    }
  } catch (e) {
    uni.showToast({
      title: e instanceof ApiError ? e.message : "操作失败",
      icon: "none", duration: 3000,
    });
  }
}

function promptRename(item: ShareListItem) {
  uni.showModal({
    title: "重命名",
    editable: true,
    placeholderText: "输入新的标题",
    content: item.report_title || "",
    success: async (r) => {
      if (!r.confirm) return;
      const next = (r.content || "").trim();
      if (!next || next === item.report_title) return;
      // 后端 update-share 需要先 beginEdit 拿编辑锁，否则返回 409「请先获取编辑锁」
      // 网页端 ShareModal.saveEdit 也是同样的三步：beginEdit → update → endEdit
      await writeWithLock(item.share_id, { report_title: next }, () => {
        item.report_title = next;
        uni.showToast({ title: "已重命名", icon: "success" });
      });
    },
  });
}

async function togglePinShare(item: ShareListItem, next: boolean) {
  await writeWithLock(item.share_id, { personal_pinned: next }, () => {
    item.personal_pinned = next;
    uni.showToast({ title: next ? "已置顶" : "已取消置顶", icon: "success" });
  });
}

// beginEdit → updateShare → endEdit 三步锁；locked_by_other 直接 toast 提示
async function writeWithLock(
  shareId: string,
  patch: Parameters<typeof updateShare>[1],
  onSuccess: () => void,
) {
  let lockAcquired = false;
  try {
    await beginEdit(shareId);
    lockAcquired = true;
    await updateShare(shareId, patch);
    onSuccess();
  } catch (e) {
    const raw = e instanceof ApiError ? e.message : "操作失败";
    // 常见后端错误消息：「他人正在编辑」、「请先获取编辑锁」（本函数已 begin，不该再见）
    uni.showToast({ title: raw, icon: "none", duration: 3000 });
  } finally {
    if (lockAcquired) {
      try { await endEdit(shareId); } catch { /* ignore */ }
    }
  }
}

function onDeleteShare(item: ShareListItem) {
  uni.showModal({
    title: "删除画匣子？",
    content: "删除后无法恢复",
    success: async (res) => {
      if (!res.confirm) return;
      try {
        await shareApi.deleteShare(item.share_id);
        personalShares.value = personalShares.value.filter((s) => s.share_id !== item.share_id);
        uni.showToast({ title: "已删除", icon: "success" });
      } catch (e) {
        uni.showToast({
          title: e instanceof ApiError ? e.message : "删除失败",
          icon: "none",
        });
      }
    },
  });
}

async function onUnlikeShare(item: ShareListItem) {
  try {
    await shareApi.unlikeShare(item.share_id);
    likedShares.value = likedShares.value.filter((s) => s.share_id !== item.share_id);
    uni.showToast({ title: "已取消喜欢", icon: "success" });
  } catch (e) {
    uni.showToast({
      title: e instanceof ApiError ? e.message : "操作失败",
      icon: "none",
    });
  }
}

// —— 集合（group）操作 ——
function onOpenGroup(g: GroupInfo) {
  if (!g?.group_id) return;
  const name = encodeURIComponent(g.group_name || "");
  uni.navigateTo({
    url: `/pages/group/index?id=${encodeURIComponent(g.group_id)}&name=${name}`,
  });
}
function onShareGroup(_g: GroupInfo) {
  // 分享按钮已是 <button open-type="share">，点击会直接弹微信好友/朋友圈面板，
  // 实际分享内容由 onShareAppMessage 根据 dataset.groupId 生成（合集详情页 path）。
  // 此回调留作埋点 / 兜底入口；不复制网页端链接。
}

// 2026-07-19：合集卡长按 → actionSheet 三项（重命名 / 分享 / 删除）
// 视觉对齐 ShareGrid 的手势契约；分享走 <button open-type=share> 是最稳的原生路径，
// 这里 actionSheet 里的"分享"点了就 toast 让用户长按合集卡上的分享按钮（微信 API 不支持编程式触发 share）
function onLongPressGroup(g: GroupInfo) {
  const actions = ["重命名", "分享", "删除"];
  uni.showActionSheet({
    itemList: actions,
    success: async (res) => {
      if (res.tapIndex === 0) return promptRenameGroup(g);
      if (res.tapIndex === 1) {
        uni.showToast({
          title: '请点合集卡右下角的"分享"按钮',
          icon: "none",
          duration: 2500,
        });
        return;
      }
      if (res.tapIndex === 2) return onDeleteGroup(g);
    },
  });
}

function promptRenameGroup(g: GroupInfo) {
  const current =
    !g.group_name || g.group_name === g.group_id ? "" : g.group_name;
  uni.showModal({
    title: "重命名合集",
    editable: true,
    placeholderText: "输入新的合集名",
    content: current,
    success: async (r) => {
      if (!r.confirm) return;
      const next = (r.content || "").trim();
      if (!next || next === current) return;
      try {
        await renameGroup(g.group_id, next);
        // 本地即时反映
        g.group_name = next;
        uni.showToast({ title: "已重命名", icon: "success" });
      } catch (e) {
        logger.warn("[home] renameGroup failed", e);
        uni.showToast({
          title: e instanceof ApiError ? e.message : "重命名失败",
          icon: "none",
          duration: 3000,
        });
      }
    },
  });
}
function onDeleteGroup(g: GroupInfo) {
  const displayedName = (!g.group_name || g.group_name === g.group_id)
    ? "合集"
    : g.group_name;
  // 2026-08-11：仅创建者（founding chapter 的 owner）可解散；共创人员点解散给友好提示
  //   避免之前"点解散 → 后端对别人的 share 返 403 → 前端把 403 当 session 过期 → 强制登出"（Bug 4）
  if (g.my_role !== 'creator') {
    uni.showModal({
      title: "无法解散",
      content: "只有合集创建人可以解散这个合集。如需退出，请联系合集创建人。",
      showCancel: false,
      confirmText: "知道了",
    });
    return;
  }
  uni.showModal({
    title: "解散合集？",
    content: `合集「${displayedName}」内的画匣子不会被删除，只是从合集移除`,
    success: async (res) => {
      if (!res.confirm) return;
      // 先乐观更新 UI（用户投诉「点了没反应」/「刷新后又回来」是因为之前只改本地不发接口）
      groups.value = groups.value.filter((x) => x.group_id !== g.group_id);
      uni.showLoading({ title: "解散中…", mask: true });
      try {
        // 拉合集所有 memories，逐个调 leave-group 把"我"拥有的那些解绑
        // 后端会在群组彻底为空时删除 group 元数据；有他人 share 时该合集仍会保留
        // 但从"我"的视角看已经清空 —— fetchMyGroups 再次拉取就不会再返回它
        const r = await fetchGroupMemories(g.group_id);
        const list = r.memories || [];
        // 并发 leave；单个失败不阻塞其它（比如别人的 share 我们无权 leave 是预期）
        await Promise.all(
          list.map((m) =>
            leaveGroup(m.share_id).catch((e) => {
              logger.info("[home] leaveGroup skip", { share_id: m.share_id, err: (e as Error)?.message });
            })
          )
        );
        // 主动重拉一次群组列表，保证后续 onShow 拉到的是最新状态
        loadedTabs.delete("groups");
        loadedTabs.delete("personal");
        uni.hideLoading();
        uni.showToast({ title: "已解散", icon: "success" });
      } catch (e) {
        uni.hideLoading();
        logger.warn("[home] onDeleteGroup failed", e);
        uni.showToast({
          title: e instanceof ApiError ? e.message : "解散失败",
          icon: "none",
          duration: 3000,
        });
        // 失败 → 回滚，让用户看到集合还在，避免"看着删了实际没删"的错觉
        loadedTabs.delete("groups");
        loadedTabs.delete("personal");
        refreshActiveTab();
      }
    },
  });
}
function onGroupMembers(g: GroupInfo) {
  uni.showToast({ title: `${g.member_count || 1} 位成员`, icon: "none" });
}

onShow(() => {
  // 自定义底栏：隐藏原生
  try { uni.hideTabBar({ animation: false, fail: () => {} }); } catch { /* h5 fallback */ }
  if (!isLoggedIn.value) return;

  auth.refreshMe();

  // 脏标：上传 / 编辑 / 删除任意 share 后由 CreationFlow / share/edit / 删除流程写入；
  // 账号切换（登录 / 登出 / applyLoginResponse）也会由 auth.ts 写入 —— 避免切号后残留上一账号的 personalShares / groups
  // 命中就把所有 tab 缓存清掉，让用户立刻看到最新（修「上传完找不到刚传的东西」+「切号后看到上一个人内容」）
  let dirty = false;
  try { dirty = !!uni.getStorageSync("photolio_home_dirty"); } catch { /* ignore */ }
  if (dirty) {
    loadedTabs.clear();
    // 同时清掉内存里上一账号残留的数据，避免 fetch 完成前用户瞄到旧内容
    personalShares.value = [];
    groups.value = [];
    likedShares.value = [];
    try { uni.removeStorageSync("photolio_home_dirty"); } catch { /* ignore */ }
  }

  // loadByTab 自身已做 loadedTabs 去重，首次加载完成后再回到首页不会重发请求
  loadByTab(activeTab.value);
});

// 下拉刷新（pages.json 的 enablePullDownRefresh 默认关，这里给个钩子，将来开启 PR 即生效）
onPullDownRefresh(async () => {
  try {
    if (activeTab.value === "personal") loadedTabs.delete("groups");
    await loadByTab(activeTab.value, true);
  } finally {
    uni.stopPullDownRefresh();
  }
});
</script>

<template>
  <view class="page">

    <!-- 2026-09-15 v3：H5 首页视觉复刻老 vue —— 背景图 + 毛玻璃
         v2 用单层 background-image + `transition: background-image` 有闪白 bug（浏览器不动画
         background-image 属性，切换是瞬时的），改成**两层交叉淡入**：每张 slide 是独立
         div，只 opacity transition；切换时新一张 opacity 从 0 → 1，旧一张同步 1 → 0。
         对齐 [annualreport/src/views/UploadView.vue L1537-1541 + styles/UploadView.css L13-33] -->
    <!-- #ifdef H5 -->
    <view class="fixed-bg-wrapper">
      <view
        v-for="(img, i) in bgImages" :key="i"
        class="bg-slide"
        :style="{ backgroundImage: `url(${img})`, opacity: currentBgIndex === i ? 1 : 0 }"
      />
      <view class="bg-blur-mask" />
    </view>
    <!-- #endif -->

    <view class="container">
      <BrandHeader />

      <view v-if="isLoggedIn" class="btn btn-primary new-btn" @click="gotoCreate"><text>{{ uiText("+ 新建画匣子") }}</text></view>

      <!-- 参考：annualreport/src/views/UploadView.vue home-tabs；个人网站与关于/旧版同排。
           按用户要求，H5 游客也能看到这三个站点入口。 -->
      <view class="seg-tabs" :class="{ 'seg-tabs--guest': !isLoggedIn }">
        <template v-if="isLoggedIn">
          <view
            v-for="t in TABS" :key="t.key"
            class="tab"
            :class="{ active: activeTab === t.key }"
            @click="switchTab(t.key)"
          >
            <text>{{ locale === 'en' ? ({ personal: 'Mine', liked: 'Likes', groups: 'Collections' }[t.key]) : t.label }}</text>
          </view>
        </template>
        <!-- #ifdef H5 -->
        <a class="tab tab-ext" href="#/pages/personal/index">{{ locale === 'en' ? 'Portfolio' : '个人网站' }}</a>
        <view class="tab tab-ext" @click="onOpenAbout"><text>{{ uiText("关于") }}</text></view>
        <view class="tab tab-ext" @click="onOpenLegacy"><text>{{ locale === 'en' ? 'Legacy' : '旧版' }}</text></view>
        <!-- #endif -->
      </view>

      <!-- 未登录 —— 审核合规版本：先让用户浏览/体验创作流程，再自选登录。
           微信驳回原因 1「打开一进入首页页面，未浏览体验功能服务，即要求授权手机号码、
           头像、昵称进行授权登录」。用户主张 NFC 是一碰即用不需要引导 UI，
           所以首页只保留创作入口（CreationFlow 允许游客走到"生成"步再拦登录）+ 登录链接。 -->
      <view v-if="!isLoggedIn" class="guest-landing">
        <view class="hero">
          <text class="hero-title">{{ uiText("画匣子") }}</text>
          <text class="hero-subtitle">{{ uiText("用一碰即开的方式，封存共同回忆") }}</text>
        </view>

        <!-- 登录做主 CTA（深色实心）：产品设计上真正的功能都在登录后，鼓励用户先登录 -->
        <view class="btn btn-primary guest-btn" @click="gotoLogin">
          <text>{{ uiText("登录 · 开始创作") }}</text>
        </view>
        <!-- 体验做次 CTA（浅色 outline）：审核合规「先浏览体验，再自选登录」；
             进 CreationFlow 未登录也能选图 / 写字 / 录音，只在点"生成"时拦登录 -->
        <view class="btn btn-ghost guest-btn" @click="gotoCreate">
          <text>{{ uiText("先体验一下") }}</text>
        </view>
        <text class="create-hint">{{ uiText("选图、录一段声音，写下这段时光") }}</text>
      </view>

      <template v-else>
        <!-- Tab content (swipeable) -->
        <view class="tab-content" @touchstart="onTouchStart" @touchend="onTouchEnd">
          <view v-if="loading" class="state"><text>{{ uiText("加载中…") }}</text></view>
          <view v-else-if="errorMsg" class="state state-err"><text>{{ uiText(errorMsg) }}</text></view>

          <!-- personal：2026-07-13 改为双列瀑布流（用户明确要求 · 小红书样式） -->
          <template v-else-if="activeTab === 'personal'">
            <view v-if="currentEmpty" class="state state-empty">
              <text>{{ uiText("还没有画匣子，点上方按钮新建一份") }}</text>
              <!-- 微信账号兜底入口：用户网页版有数据但小程序登录后看不到 → 引导绑定 -->
              <view v-if="canBindLegacy" class="bind-cta" @click="gotoBindLegacy">
                <text>{{ uiText("在画匣子网页版有数据？点这里绑定旧账号 →") }}</text>
              </view>
            </view>
            <MasonryFeed
              v-else
              :items="personalMasonry"
              :selection-mode="selectionMode"
              :selected-ids="selectedIds"
              @pick="onPickPersonalMasonry"
              @longpress="onLongPressPersonalMasonry"
              @menu="onMenuPersonalMasonry"
              @toggle="onTogglePersonalMasonry"
            />
          </template>

          <!-- liked：喜欢的画匣子也走瀑布流 -->
          <template v-else-if="activeTab === 'liked'">
            <view v-if="currentEmpty" class="state state-empty">
              <text>{{ uiText("还没有喜欢的画匣子") }}</text>
            </view>
            <MasonryFeed
              v-else
              :items="likedMasonry"
              @pick="onPickLikedMasonry"
              @longpress="onLongPressLikedMasonry"
            />
          </template>

          <!-- groups（画匣子集合 / 文件夹） -->
          <template v-else-if="activeTab === 'groups'">
            <view v-if="currentEmpty" class="state state-empty">
              <text>{{ uiText("还没有合集") }}</text>
            </view>
            <view v-else class="group-list">
              <GroupFolderCard
                v-for="g in groups"
                :key="g.group_id"
                :group="g"
                @pick="onOpenGroup"
                @share="onShareGroup"
                @delete="onDeleteGroup"
                @members="onGroupMembers"
                @longpress="onLongPressGroup"
              />
            </view>
          </template>

        </view>
      </template>
    </view>

    <CustomTabBar active="home" />

    <!-- 2026-07-15：多选态浮动底栏 —— 覆盖在 CustomTabBar 上方 -->
    <view v-if="selectionMode" class="selection-bar">
      <text class="sel-count">{{ uiText("已选") }} {{ selectedIds.length }}</text>
      <view class="sel-btn" @click="selectAllPersonal">
        <text>{{ selectedIds.length === personalMasonry.length ? uiText("全不选") : uiText("全选") }}</text>
      </view>
      <view class="sel-btn sel-btn-danger" @click="deleteSelectedPersonal">
        <text>{{ uiText("删除") }}</text>
      </view>
      <view class="sel-btn" @click="exitSelection">
        <text>{{ uiText("取消") }}</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;


.page {
  min-height: 100vh;
  background: t.$color-bg;
  padding-bottom: calc(120rpx + env(safe-area-inset-bottom)); // 给自定义底栏留位
}

/* 2026-09-15 v2：H5 视觉复刻老 vue —— 背景图 + 毛玻璃 + 右上圆钮
   契约来源 [annualreport/src/styles/UploadView.css + auth/login.css] */

/* ── 背景图轮播 + 毛玻璃覆盖 ── */
.fixed-bg-wrapper {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;   // 别拦截点击
}
.bg-slide {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  /* 2026-09-15 v3：只 opacity transition，别对 background-image transition
     （浏览器不动画 background-image → 会瞬时切换 → 闪白。老 vue 用两层 opacity 交叉淡入） */
  transition: opacity 1.5s ease-in-out;
  opacity: 0;
}
.bg-blur-mask {
  position: absolute;
  inset: 0;
  backdrop-filter: blur(25px);
  -webkit-backdrop-filter: blur(25px);
  /* 只透一点色调 —— 0.88 半透明 bg 上叠 25px blur */
  background: rgba(253, 251, 248, 0.88);
}
/* 页面主体位于毛玻璃之上 */
.container { position: relative; z-index: 10; }

.container {
  max-width: 1400rpx;
  margin: 0 auto;
  padding: 0 t.$spacing-4;
}

// ---- 未登录态（审核合规：先浏览体验，再自选登录） ----
.guest-landing {
  padding: t.$spacing-6 0 t.$spacing-5;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: t.$spacing-3;
}
.hero {
  text-align: center;
  padding: t.$spacing-6 0 t.$spacing-6;
  .hero-title {
    display: block;
    font-size: t.$font-2xl;
    font-weight: 700;
    color: t.$color-text;
    letter-spacing: 8rpx;
  }
  .hero-subtitle {
    display: block;
    margin-top: t.$spacing-3;
    font-size: t.$font-sm;
    color: t.$color-text-soft;
  }
}
// 主 / 次 CTA 宽度一致，视觉上并列强弱对比 —— 深色实心 vs 浅色 outline
.guest-btn {
  width: 80%;
  max-width: 480rpx;
}
.btn-ghost {
  background: transparent;
  color: t.$color-accent;
  border: 2rpx solid t.$color-accent;
}
.create-hint {
  margin-top: t.$spacing-2;
  font-size: t.$font-xs;
  color: t.$color-text-soft;
  text-align: center;
}

// ---- 按钮 ----
.btn {
  box-sizing: border-box;
  height: 88rpx; line-height: 88rpx;
  border-radius: t.$radius-pill;
  padding: 0 t.$spacing-6;
  font-size: t.$font-md;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
}
.btn-primary { background: t.$color-accent; color: t.$color-text-invert; }
.new-btn {
  width: 100%;
  margin: t.$spacing-3 0 t.$spacing-4;
}

// ---- Tab bar ----
/* 2026-09-14 BUG2 根因：这里原本叫 `.tab-bar`，跟 CustomTabBar 的底栏**类名撞车**。
   App.vue 的 H5 全局规则 `.tab-bar { left:50% !important; transform: translateX(-50%) !important }`
   本意只锁底栏，却一并命中了这个分段 tab 行。
   该元素是 position:static，`left` 无效但 **transform 照样生效** → 整行左移半个宽度。
   实测证据（浏览器量的真实 DOM）：
     我的/喜欢/合集 → position:static, transform:matrix(1,0,0,1,-224,0), left:208（应为 432）
   改名为 .seg-tabs 彻底避开。*/
.seg-tabs {
  display: flex;
  gap: 0;
  border-bottom: 2rpx solid t.$color-border;
  margin-bottom: t.$spacing-3;
}
.seg-tabs--guest { display: none; }
/* #ifdef H5 */
.seg-tabs--guest { display: flex; }
/* #endif */
.tab {
  flex: 1;
  padding: t.$spacing-3 0;
  text-align: center;
  font-size: t.$font-sm;
  color: t.$color-text-mute;
  position: relative;
}
.tab.active {
  color: t.$color-text;
  font-weight: t.$weight-bold;
}
.tab.active::after {
  content: "";
  position: absolute;
  bottom: -2rpx; left: 50%;
  transform: translateX(-50%);
  width: 56rpx; height: 4rpx;
  background: t.$color-accent;
  border-radius: 999rpx;
}

/* 2026-09-15 v4：外链假 tab（关于 / 旧版）跟内容 tab 完全对齐
   —— 均分宽度、同 padding、同字号字重、同颜色。
   v3 用 flex:0 + 不同 padding + opacity 0.65 → 用户视觉难受，改成与其他 tab 严格 1:1。
   唯一区别：外链没有 active 下划线（点击是跳外站，不该显示 active）。 */
.tab-ext {
  text-decoration: none;
  /* 继承 .tab 的全部属性 —— flex:1 / padding / font-size / color 都已经在 .tab 定义 */
}
.tab-ext:active { opacity: 0.6; }

.tab-content { min-height: 600rpx; }

// ---- 状态 ----
.state {
  padding: t.$spacing-6 0;
  text-align: center;
  color: t.$color-text-mute;
  font-size: t.$font-sm;
}
.state-err { color: t.$color-danger; }

.bind-cta {
  margin-top: t.$spacing-4;
  padding: t.$spacing-3 t.$spacing-4;
  border: 2rpx solid t.$color-accent;
  background: rgba(61, 46, 31, 0.06);
  border-radius: t.$radius-pill;
  font-size: t.$font-sm;
  color: t.$color-accent;
  text-align: center;
}

// ---- Group folder list ----
.group-list { display: flex; flex-direction: column; gap: t.$spacing-4; }

// ---- Mixed personal list（shares + folders 时间序混排） ----
.mixed-list { display: flex; flex-direction: column; gap: t.$spacing-4; }
.mixed-item { width: 100%; }

// 2026-07-15：多选态浮动底栏 —— 盖在 CustomTabBar 上层
.selection-bar {
  position: fixed;
  left: 0; right: 0;
  bottom: 0;
  padding: t.$spacing-3 t.$spacing-4 calc(env(safe-area-inset-bottom) + #{t.$spacing-3});
  background: t.$color-bg;
  border-top: 2rpx solid t.$color-border;
  display: flex;
  align-items: center;
  gap: t.$spacing-2;
  z-index: 60;   // 高于 CustomTabBar
  box-shadow: 0 -8rpx 24rpx rgba(61, 46, 31, 0.10);
}
.sel-count {
  font-size: t.$font-sm;
  color: t.$color-text-soft;
  padding-right: t.$spacing-2;
}
.sel-btn {
  flex: 1;
  height: 72rpx; line-height: 72rpx;
  border-radius: 999rpx;
  text-align: center;
  border: 2rpx solid t.$color-border;
  background: t.$color-surface;
  color: t.$color-text-soft;
  font-size: t.$font-sm;
}
.sel-btn-danger {
  background: t.$color-accent;
  color: t.$color-text-invert;
  border-color: t.$color-accent;
}

/* 参考：annualreport/src/views/UploadView.vue home-tabs；手机用两行，给完整译名固定间隔。 */
@media (max-width: 600px) {
  .seg-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 10px; row-gap: 2px; }
  .seg-tabs--guest { display: none; }
  /* #ifdef H5 */
  .seg-tabs--guest { display: grid; }
  /* #endif */
  .tab { min-width: 0; padding: 12px 4px; font-size: 14px; white-space: nowrap; }
  .new-btn { margin-top: 4px; margin-bottom: 12px; }
}
</style>
<!-- 2026-09-15 v3：删除 v2 非 scoped 覆盖 —— Vue 编译器把它当 scoped 处理（每个选择器被
     加上 [data-v-xxx] → 永远匹不到根节点）→ 从没生效过。改成全局 480→700 收敛（pages.json
     maxWidth + App.vue global override + CustomTabBar scoped 三处一起动）。 -->
