<script setup lang="ts">
/**
 * 通用图片选择器。
 *
 * **全仓所有「选图」场景都用这一个组件**（创作页、头像上传、NFC 绑定页未来的封面选择等）。
 * 旧网页版 UploadDropzone / ShareModal 各写一套 → 改图压逻辑必丢一处。本组件吸取教训。
 *
 * 用法:
 *   <MediaPicker v-model="files" :max="9" :readonly="busy" />
 *
 * value 是 string[]（uni.chooseMedia 拿到的本地 tempFilePath），不经过远程上传 —— 上传由调用方决定时机。
 */
import { computed } from "vue";
import { ensurePrivacyAuthorized } from "@/utils/privacy";
import { explainChatFileSourceOnce } from "@/utils/chat-file-hint";

const props = withDefaults(defineProps<{
  /** 已选文件路径列表（本地 tempFilePath） */
  modelValue: string[];
  /** 最多张数；默认 9 */
  max?: number;
  /** 只读：不能添加 / 不能删除 */
  readonly?: boolean;
  /**
   * 2026-07-15 加：选图入口模式
   *   - 'default'（默认）：uni.chooseMedia 直接从相册选（微信会剥 EXIF + 丢原文件名）
   *   - 'album'：先弹 actionSheet 让用户选「从聊天文件（推荐，保留 EXIF+原名）」/「从相册」
   *     用户在 album/index 追加已经这样做；这里让 CreationFlow 新建相册也走同一路径
   *
   * 返回带 name 字段的对象数组给父组件，父组件（CreationFlow → useCreation）需相应地把 name 透传
   * 到上传时的 formData.original_filename
   */
  chooserMode?: "default" | "album";
  /** 2026-07-19：原图模式。开时 chooseMedia 用 sizeType:["original"] 尽量避免微信客户端二次压缩 */
  original?: boolean;
}>(), {
  max: 9,
  readonly: false,
  chooserMode: "default",
  original: false,
});

/**
 * 2026-07-15：为了让 CreationFlow 新建相册模式也能拿到真名 + EXIF，
 * 除了原本的 string[] tempFilePath 外，可选发出 detail 事件带 { path, name }
 * CreationFlow 收到后建立 tempFilePath → originalName 的映射，透传给 uploadImage
 */
export interface PickedFile {
  path: string;
  name: string;   // 空串表示 chooseMedia 拿不到真名（默认相册来源）
}
const emit = defineEmits<{
  (e: "update:modelValue", value: string[]): void;
  (e: "picked", files: PickedFile[]): void;
}>();

const canAdd = computed(() => !props.readonly && props.modelValue.length < props.max);
const remaining = computed(() => Math.max(0, props.max - props.modelValue.length));

async function pickImages() {
  if (!canAdd.value) return;
  // H5 没有微信「聊天文件」概念 —— chooserMode="album" 的 actionSheet 引导对 h5 无意义。
  // 直接走 _pickDefault（h5 里用 uni.chooseImage 从设备相册/文件系统选，能拿真原图 + EXIF）
  // #ifdef H5
  await _pickDefault();
  return;
  // #endif
  // #ifndef H5
  if (props.chooserMode === "album") {
    await _pickAlbumMode();
    return;
  }
  await _pickDefault();
  // #endif
}

async function _pickDefault() {
  // #ifdef H5
  // H5：uni.chooseMedia 在 uni-h5 里没实现（会 "is not a function"）。
  // 用 uni.chooseImage 兜底 —— 底层是 DOM `<input type="file" accept="image/*" multiple>`，
  // 桌面浏览器 / 手机浏览器都支持；能拿到浏览器原图 + EXIF 完整保留。
  try {
    console.log("[media-picker] h5 chooseImage start", { count: remaining.value });
    const res = await new Promise<UniApp.ChooseImageSuccessCallbackResult>((resolve, reject) => {
      uni.chooseImage({
        count: remaining.value,
        sourceType: ["album", "camera"],
        // H5 sizeType 主要影响移动端浏览器压缩策略，桌面浏览器都是原图
        sizeType: ["original"], // GIF原文件由浏览器保留；静态图压缩交给useCreation。
        success: resolve,
        fail: reject,
      });
    });
    const paths = Array.isArray(res.tempFilePaths) ? res.tempFilePaths : [res.tempFilePaths].filter(Boolean);
    // uni-h5 里 tempFiles 是 File 对象，name 就是原文件名（例：IMG_20250712_143022.jpg）
    const tempFiles = (res as unknown as { tempFiles?: Array<File | { name?: string; path?: string }> }).tempFiles || [];
    const files = paths.map((p, i) => {
      const tf = tempFiles[i] as { name?: string } | undefined;
      return { path: p, name: tf?.name || "" };
    });
    _commit(files);
  } catch (e) {
    const errMsg = String((e as { errMsg?: string })?.errMsg || (e instanceof Error ? e.message : ""));
    if (/cancel/i.test(errMsg)) return;
    const safeMsg = /[a-zA-Z]{4,}/.test(errMsg) ? "选择图片失败，请重试" : (errMsg || "选择失败");
    uni.showToast({ title: safeMsg, icon: "none", duration: 3000 });
  }
  return;
  // #endif
  // #ifndef H5
  try {
    // 隐蔽 bug：mp-weixin 基础库 ≥2.32 起，chooseMedia 属于「隐私接口」，manifest.json
    // 的 mp-weixin.requiredPrivateInfos 未声明就会 fail 并抛 "api scope is not declared"。
    // 修复：小程序管理后台 → 用户隐私保护指引 里加「相册/摄像头」。日志保留便于回归时定位。
    console.log("[media-picker] chooseMedia start", { count: remaining.value, original: props.original });
    const res = await new Promise<UniApp.ChooseMediaSuccessCallbackResult>((resolve, reject) => {
      uni.chooseMedia({
        // 微信 chooseMedia 单次硬限 20；remaining 在相册模式可能远大于 20，
        // 传超限值微信会直接 fail。截断 → 用户分批选。
        count: Math.min(remaining.value, 20),
        mediaType: ["image"],
        // 2026-07-19：原图模式必传 sizeType:["original"]，否则微信客户端会返回压过的版本
        sizeType: props.original ? ["original"] : ["compressed"],
        sourceType: ["album", "camera"],
        success: (r) => {
          console.log("[media-picker] chooseMedia success", { count: r.tempFiles?.length });
          resolve(r);
        },
        fail: (err) => {
          console.warn("[media-picker] chooseMedia fail", err);
          reject(new Error(err.errMsg || "选择图片失败"));
        },
      });
    });
    const files = (res.tempFiles || [])
      .filter((f) => !!f.tempFilePath)
      .map((f) => ({ path: f.tempFilePath, name: "" }));
    _commit(files);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (!/cancel/i.test(msg)) {
      uni.showToast({ title: msg || "选择失败", icon: "none", duration: 3000 });
    }
  }
  // #endif
}

async function _pickAlbumMode() {
  // 2026-09-17 契约翻转（用户决策）：**取消 chooseMessageFile 入口**。历史上是"推荐"
  // 走它保 EXIF+文件名，但用户报"入口太抽象、选个对话框显示无内容"（chooseMessageFile
  // 打开的是"用户微信里以文件形式发过的文件列表"，不是相册，反直觉）。改成直接走
  // chooseMedia 相册原图模式，EXIF 保不住就算了。大批量走 h5 网页版入口。
  await _pickDefault();
}

// 统一 commit：既发 update:modelValue（保持 v-model 兼容旧调用方），
// 也发 picked（新调用方拿真名做 originalFilename 映射）
function _commit(files: PickedFile[]) {
  if (files.length === 0) return;
  const paths = files.map((f) => f.path);
  // 2026-09-14 顺序 bug：必须**先** emit picked（父组件据此建立 path→真实文件名 映射），
  // **再** emit update:modelValue（父组件收到就立刻开跑 prepareImages 上传）。
  //
  // 反过来的话，上传发起时映射表还是空的 → originalFilename 拿不到 →
  // 后端只能从 blob 路径取名，存成 `694910da-8c57-47e1-975a-43c0ac77408f.jpg` 这种 UUID。
  // 用户实测日志里的 `选图变化 { namedCount: 0 }` 紧跟着 `prepareImages 开始上传`
  // 就是这个顺序的直接证据。
  emit("picked", files);
  emit("update:modelValue", [...props.modelValue, ...paths].slice(0, props.max));
}

function removeAt(idx: number) {
  if (props.readonly) return;
  const next = [...props.modelValue];
  next.splice(idx, 1);
  emit("update:modelValue", next);
}

function previewAt(idx: number) {
  uni.previewImage({ urls: props.modelValue, current: props.modelValue[idx] });
}
</script>

<template>
  <view class="picker">
    <view
      v-for="(p, idx) in modelValue"
      :key="`${idx}-${p}`"
      class="tile"
    >
      <image class="tile-img" :src="p" mode="aspectFill" @click="previewAt(idx)" />
      <view v-if="!readonly" class="tile-remove" @click="removeAt(idx)" hover-class="tile-remove-hover">
        <text class="tile-remove-text">×</text>
      </view>
    </view>

    <view v-if="canAdd" class="tile tile-add" hover-class="tile-add-hover" @click="pickImages">
      <text class="add-plus">＋</text>
      <text class="add-hint">{{ modelValue.length }} / {{ max }}</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.picker {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: t.$spacing-2;
}

.tile {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: t.$radius-md;
  overflow: hidden;
  background: t.$color-surface-2;
}

.tile-img {
  width: 100%;
  height: 100%;
}

.tile-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2rpx dashed t.$color-border;
  background: t.$color-surface;
  .add-plus {
    font-size: 56rpx;
    line-height: 1;
    color: t.$color-text-mute;
  }
  .add-hint {
    margin-top: t.$spacing-1;
    font-size: t.$font-xs;
    color: t.$color-text-mute;
  }
}
.tile-add-hover { background: t.$color-surface-2; }

.tile-remove {
  position: absolute;
  top: 6rpx;
  right: 6rpx;
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background: rgba(20, 14, 8, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
}
.tile-remove-hover { background: rgba(20, 14, 8, 0.85); }
.tile-remove-text {
  color: #fff;
  font-size: 28rpx;
  line-height: 1;
}
</style>
