import type { FiatRates } from '../types';

const API_URL = 'https://open.er-api.com/v6/latest/USD';
const CACHE_KEY = 'gostigo:fiat-rates:v1';
const CACHE_TTL_MS = 12 * 60 * 1000;

type ExchangeRateApiResponse = {
  result: 'success' | 'error';
  provider?: string;
  time_last_update_utc?: string;
  time_next_update_utc?: string;
  base_code?: string;
  rates?: Record<string, number>;
  'error-type'?: string;
};

function isFiatRates(value: unknown): value is FiatRates {
  if (!value || typeof value !== 'object') return false;

  const data = value as Partial<FiatRates>;
  return (
    typeof data.baseCode === 'string' &&
    typeof data.lastUpdatedAt === 'string' &&
    typeof data.nextUpdatedAt === 'string' &&
    typeof data.cachedAt === 'number' &&
    typeof data.provider === 'string' &&
    !!data.rates &&
    typeof data.rates === 'object'
  );
}

export function getCachedFiatRates(options: { allowExpired?: boolean } = {}) {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw);
    if (!isFiatRates(cached)) return null;

    const isExpired = Date.now() - cached.cachedAt > CACHE_TTL_MS;
    if (isExpired && !options.allowExpired) return null;

    return { ...cached, isStale: isExpired };
  } catch {
    return null;
  }
}

export async function fetchFiatRates(): Promise<FiatRates> {
  const response = await fetch(API_URL, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Rates request failed with status ${response.status}`);
  }

  const data = (await response.json()) as ExchangeRateApiResponse;

  if (data.result !== 'success' || !data.rates || !data.base_code) {
    throw new Error(data['error-type'] ?? 'Rates response was not successful');
  }

  const rates: FiatRates = {
    baseCode: data.base_code,
    rates: data.rates,
    lastUpdatedAt: data.time_last_update_utc ?? new Date().toUTCString(),
    nextUpdatedAt: data.time_next_update_utc ?? '',
    cachedAt: Date.now(),
    provider: data.provider ?? 'https://www.exchangerate-api.com',
    isStale: false,
  };

  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(rates));
  } catch {
    // Rates should still render if localStorage is unavailable.
  }

  return rates;
}
