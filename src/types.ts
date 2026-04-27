export type AppTab = 'calculator' | 'fiat' | 'crypto';

export type CalculatorMode = 'standard' | 'fiat' | 'crypto';

export type Currency = {
  code: string;
  name: string;
  symbol: string;
  country: string;
};

export type Coin = {
  id: string;
  code: string;
  name: string;
  stablecoin?: boolean;
};

export type CryptoCoinPrice = {
  usd: number;
  rub: number;
  change24h: number | null;
  lastUpdatedAt: number | null;
};

export type CryptoPrices = {
  prices: Record<string, CryptoCoinPrice>;
  cachedAt: number;
  provider: string;
  isStale: boolean;
};

export type FiatRates = {
  baseCode: string;
  rates: Record<string, number>;
  lastUpdatedAt: string;
  nextUpdatedAt: string;
  cachedAt: number;
  provider: string;
  isStale: boolean;
};

export type TelegramUser = {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
};

export type TelegramLaunchState = {
  isTelegram: boolean;
  colorScheme: 'light' | 'dark';
  platform: string;
  user: TelegramUser | null;
  viewportHeight: number | null;
  stableViewportHeight: number | null;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        isExpanded?: boolean;
        colorScheme?: 'light' | 'dark';
        platform?: string;
        initData?: string;
        initDataUnsafe?: {
          user?: TelegramUser;
          auth_date?: number;
          query_id?: string;
          start_param?: string;
        };
        themeParams?: Record<string, string>;
        viewportHeight?: number;
        stableViewportHeight?: number;
        onEvent?: (eventType: 'themeChanged' | 'viewportChanged', eventHandler: () => void) => void;
        offEvent?: (eventType: 'themeChanged' | 'viewportChanged', eventHandler: () => void) => void;
        HapticFeedback?: {
          selectionChanged: () => void;
          impactOccurred: (style: 'light' | 'medium' | 'heavy') => void;
        };
      };
    };
  }
}
