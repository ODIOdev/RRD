import { t } from "../i18n";

type ConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

let resolvePending: ((value: boolean) => void) | null = null;

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function closeConfirmDialog(result: boolean): void {
  $("confirmDialog")?.classList.add("hidden");
  const resolve = resolvePending;
  resolvePending = null;
  resolve?.(result);
}

export function confirmWarning(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  const dialog = $("confirmDialog");
  const titleEl = $("confirmDialogTitle");
  const messageEl = $("confirmDialogMessage");
  const confirmBtn = $("confirmDialogConfirm") as HTMLButtonElement | null;
  const cancelBtn = $("confirmDialogCancel") as HTMLButtonElement | null;

  if (!dialog || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
    return Promise.resolve(window.confirm(message));
  }

  if (resolvePending) closeConfirmDialog(false);

  titleEl.textContent = options.title || t("confirm.warningTitle");
  messageEl.textContent = message;
  confirmBtn.textContent = options.confirmLabel || t("confirm.continue");
  cancelBtn.textContent = options.cancelLabel || t("login.cancel");

  dialog.classList.remove("hidden");
  confirmBtn.focus();

  return new Promise((resolve) => {
    resolvePending = resolve;
  });
}

export function bindConfirmDialog(): void {
  $("confirmDialogConfirm")?.addEventListener("click", () => closeConfirmDialog(true));
  $("confirmDialogCancel")?.addEventListener("click", () => closeConfirmDialog(false));
  $("confirmDialogClose")?.addEventListener("click", () => closeConfirmDialog(false));
  $("confirmDialog")?.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).id === "confirmDialog") closeConfirmDialog(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("confirmDialog")?.classList.contains("hidden")) {
      closeConfirmDialog(false);
    }
  });
}
