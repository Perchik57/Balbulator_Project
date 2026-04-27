import { coins } from '../data/markets';
import type { CryptoPrices } from '../types';

const COIN_IDS = coins.map((coin) => coin.id).join(',');
const API_URL = `https://api.coingecko.com/api/v3/simple/price?ids=${COIN_IDS}&vs_currencies=usd,rub&include_24hr_change=true&include_last_updated_at=true`;
const CACHE_KEY = 'gostigo:crypto-prices:v1';
const CACHE_TTL_MS = 45 * 1000;

type CoinGeckoSimplePrice = Record<
  string,
  {
    usd?: number;
    rub?: number;
    usd_24h_change?: number | null;
    last_updated_at?: number | null;
  }
>;

function isCryptoPrices(value: unknown): value is CryptoPrices {
  if (!value || typeof value !== 'object') return false;

  const data = value as Partial<CryptoPrices>;
  return (
    !!data.prices &&
    typeof data.prices === 'object' &&
    typeof data.cachedAt === 'number' &&
    typeof data.provider === 'string'
  );
}

export function getCachedCryptoPrices(options: { allowExpired?: boolean } = {}) {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw);
    if (!isCryptoPrices(cached)) return null;

    const isExpired = Date.now() - cached.cachedAt > CACHE_TTL_MS;
    if (isExpired && !options.allowExpired) return null;

    return { ...cached, isStale: isExpired };
  } catch {
    return null;
  }
}

export async function fetchCryptoPrices(): Promise<CryptoPrices> {
  const response = await fetch(API_URL, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Crypto request failed with status ${response.status}`);
  }

  const data = (await response.json()) as CoinGeckoSimplePrice;
  const prices: CryptoPrices['prices'] = {};

  coins.forEach((coin) => {
    const price = data[coin.id];
    if (typeof price?.usd === 'number' && typeof price?.rub === 'number') {
      prices[coin.code] = {
        usd: price.usd,
        rub: price.rub,
        change24h: typeof price.usd_24h_change === 'number' ? price.usd_24h_change : null,
        lastUpdatedAt: typeof price.last_updated_at === 'number' ? price.last_updated_at : null,
      };
    }
  });

  if (Object.keys(prices).length === 0) {
    throw new Error('Crypto response did not include usable prices');
  }

  const result: CryptoPrices = {
    prices,
    cachedAt: Date.now(),
    provider: 'https://www.coingecko.com',
    isStale: false,
  };

  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(result));
  } catch {
    // Prices should still render if localStorage is unavailable.
  }

  return result;
}
