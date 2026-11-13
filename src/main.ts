import { createSSRApp } from "vue";
import { createPinia } from "pinia";
import { installLocale } from "@/i18n";
import App from "./App.vue";
// #ifdef H5
import { installViewportPlayback } from "@/services/viewportPlayback";
// #endif

export function createApp() {
  const app = createSSRApp(App);
  app.use(createPinia());
  installLocale(app);
  // #ifdef H5
  app.mixin({ mounted() { if (!document.documentElement.hasAttribute("data-viewport-playback")) { document.documentElement.setAttribute("data-viewport-playback", "active"); installViewportPlayback(); } } });
  // #endif
  return {
    app,
  };
}
