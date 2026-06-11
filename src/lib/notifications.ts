export const notify = (message: string, type: 'info' | 'success' | 'warning' = 'info') => {
  window.dispatchEvent(new CustomEvent('app-notify', { detail: { message, type } }));
};
