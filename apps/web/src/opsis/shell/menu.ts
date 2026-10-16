export function openToolMenu(dialog: HTMLDialogElement) {
  if (!dialog.open) dialog.showModal();
  dialog.querySelector<HTMLButtonElement>("button")?.focus();
}
export function closeToolMenu(
  dialog: HTMLDialogElement,
  trigger: HTMLButtonElement | null,
) {
  if (dialog.open) dialog.close();
  trigger?.focus();
}
