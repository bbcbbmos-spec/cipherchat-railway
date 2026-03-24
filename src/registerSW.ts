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
        
        // Request notification permission
        if ('Notification' in window) {
          Notification.requestPermission().then((permission) => {
            if (permission === 'granted') {
              console.log('Notification permission granted.');
            }
          });
        }
      },
      onRegisterError(error) {
        console.error('Service Worker registration failed:', error);
      },
    });
  }
}
