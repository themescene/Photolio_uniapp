import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
export const useDebugStore = defineStore('debug', () => {
  const auth = useAuthStore(), requested = ref(false)
  const authorized = computed(() => !!auth.user?.entitlements?.includes('preset_links'))
  const enabled = computed(() => authorized.value && requested.value)
  function setEnabled(value: boolean) { requested.value = authorized.value && value }
  // 调试是本次会话的显式选择，启动/切换账号均默认关闭。
  watch(() => auth.token, () => { requested.value = false })
  watch(authorized, value => { if (!value) requested.value = false })
  return { authorized, enabled, setEnabled }
})
