export function showToast(message, durationMs = 2800) {
  const root = document.getElementById('toast-root');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  root.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, durationMs);
}
