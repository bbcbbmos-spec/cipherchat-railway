import { registerSW } from 'virtual:pwa-register';

export function registerServiceWorker() {
  if (import.meta.env.DEV) return; // Skip SW in dev mode to avoid redirect issues
  if ('serviceWorker' in navigator) {
    const updateSW = registerSW({
      onNeedRefresh() {
        // Automatically update for now to avoid blocking UI in iframe
        updateSW(true);
      },
      onOfflineReady() {
        console.log('App ready for offline use.');
      },
      onRegistered(registration) {
        console.log('Service Worker registered:', registration);
        // NOTE: Notification.requestPermission() removed from here.
        // Safari requires it to be called from a user gesture (button click).
        // Use requestNotificationPermission() exported below instead.
      },
      onRegisterError(error) {
        console.error('Service Worker registration failed:', error);
      },
    });
  }
}

/**
 * Call this function from a button click handler to request notification permission.
 * Safari requires Notification.requestPermission() to be called from a user gesture.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission | null> {
  if (!('Notification' in window)) return null;
  try {
    const permission = await Notification.requestPermission();
    console.log('Notification permission:', permission);
    return permission;
  } catch (e) {
    console.error('Notification permission error:', e);
    return null;
  }
}
