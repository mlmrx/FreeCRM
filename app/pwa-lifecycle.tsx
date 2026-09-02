'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function subscribeToNetworkState(notify: () => void) {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
}

function browserIsOnline() {
  return navigator.onLine;
}

function serverIsOnline() {
  return true;
}

export default function PwaLifecycle() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [update, setUpdate] = useState<ServiceWorkerRegistration | null>(null);
  const offline = !useSyncExternalStore(subscribeToNetworkState, browserIsOnline, serverIsOnline);

  useEffect(() => {
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => setInstallPrompt(null);

    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    let controllerChanged = false;
    const onControllerChange = () => {
      if (controllerChanged) return;
      controllerChanged = true;
      window.location.reload();
    };
    navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange);

    if ('serviceWorker' in navigator && (window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then((registration) => {
        if (registration.waiting) setUpdate(registration);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) setUpdate(registration);
          });
        });
      }).catch(() => {
        // The application remains fully usable when registration is blocked.
      });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  async function install() {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } catch {
      // Browser or embedding policy can withdraw an install prompt at any time.
    } finally {
      setInstallPrompt(null);
    }
  }

  function activateUpdate() {
    update?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  }

  if (!offline && !installPrompt && !update) return null;

  return (
    <aside className="pwa-lifecycle" aria-live="polite" aria-atomic="true">
      {offline && <div><span aria-hidden="true">○</span><p><strong>You are offline.</strong> Public pages visited before may remain available. Workspace, sign-in, and API requests always require the network.</p></div>}
      {installPrompt && <div><span aria-hidden="true">＋</span><p><strong>Install FREE CRM.</strong> Add this user-owned web app to your device; installation does not grant data or provider access.</p><button type="button" onClick={() => void install()}>Install</button></div>}
      {update && <div><span aria-hidden="true">↻</span><p><strong>Update ready.</strong> Reload into the reviewed application version when you are ready.</p><button type="button" onClick={activateUpdate}>Update</button></div>}
    </aside>
  );
}
