import type { TelegramLaunchState } from './types';

const defaultTelegramState: TelegramLaunchState = {
  isTelegram: false,
  colorScheme: 'light',
  platform: 'browser',
  user: null,
  viewportHeight: null,
  stableViewportHeight: null,
};

function applyCssVar(name: string, value?: string) {
  if (value) {
    document.documentElement.style.setProperty(name, value);
  }
}

function applyTelegramTheme() {
  const webApp = window.Telegram?.WebApp;
  const theme = webApp?.themeParams;

  applyCssVar('--tg-bg', theme?.bg_color);
  applyCssVar('--tg-text', theme?.text_color);
  applyCssVar('--surface', theme?.secondary_bg_color);
  applyCssVar('--surface-soft', theme?.section_bg_color);
  applyCssVar('--muted', theme?.hint_color);
  applyCssVar('--accent', theme?.button_color);
  applyCssVar('--accent-strong', theme?.button_color);

  document.documentElement.dataset.telegramTheme = webApp?.colorScheme ?? 'light';
}

function applyTelegramViewport() {
  const webApp = window.Telegram?.WebApp;
  const height = webApp?.viewportHeight ?? webApp?.stableViewportHeight;

  if (height) {
    document.documentElement.style.setProperty('--tg-viewport-height', `${height}px`);
  }
}

function readTelegramState(): TelegramLaunchState {
  const webApp = window.Telegram?.WebApp;

  if (!webApp) {
    document.documentElement.dataset.telegram = 'false';
    return defaultTelegramState;
  }

  document.documentElement.dataset.telegram = 'true';
  applyTelegramTheme();
  applyTelegramViewport();

  return {
    isTelegram: true,
    colorScheme: webApp.colorScheme ?? 'light',
    platform: webApp.platform ?? 'telegram',
    user: webApp.initDataUnsafe?.user ?? null,
    viewportHeight: webApp.viewportHeight ?? null,
    stableViewportHeight: webApp.stableViewportHeight ?? null,
  };
}

export function initializeTelegramApp(onChange: (state: TelegramLaunchState) => void) {
  const webApp = window.Telegram?.WebApp;

  if (!webApp) {
    onChange(defaultTelegramState);
    return () => undefined;
  }

  try {
    webApp.ready();
    if (!webApp.isExpanded) {
      webApp.expand();
    }
  } catch {
    // Browser development should keep working even if Telegram methods fail.
  }

  const syncState = () => onChange(readTelegramState());
  syncState();

  webApp.onEvent?.('themeChanged', syncState);
  webApp.onEvent?.('viewportChanged', syncState);

  return () => {
    webApp.offEvent?.('themeChanged', syncState);
    webApp.offEvent?.('viewportChanged', syncState);
  };
}
