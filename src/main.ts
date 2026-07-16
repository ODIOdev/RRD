import { initApp } from "./app";
import { mountAdminDataBinsPanel } from "./admin/AdminDataBinsPanel";
import { internalDatabase } from "./storage/internalDatabase";
import { initI18n, mountLangToggle, t } from "./i18n";

declare global {
  interface Window {
    RRDB: typeof internalDatabase;
  }
}

async function boot() {
  initI18n();
  mountLangToggle();
  window.RRDB = internalDatabase;
  await initApp();
  mountAdminDataBinsPanel("#adminDataBinsRoot");
}

boot().catch((err) => {
  console.error("RR boot failed", err);
  alert(t("alert.dbFail"));
});
