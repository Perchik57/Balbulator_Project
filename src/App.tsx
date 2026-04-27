import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchCryptoPrices, getCachedCryptoPrices } from './api/cryptoPrices';
import { fetchFiatRates, getCachedFiatRates } from './api/exchangeRates';
import { coins, currencies, defaultBaseCurrency } from './data/markets';
import { initializeTelegramApp } from './telegram';
import type { AppTab, CalculatorMode, Coin, CryptoPrices, Currency, FiatRates, TelegramLaunchState } from './types';

const fiatBaseOptions = ['RUB', 'USD', 'EUR', 'CNY'];

const navItems: Array<{ id: AppTab; label: string; icon: string }> = [
  { id: 'calculator', label: 'Калькулятор', icon: '=' },
  { id: 'fiat', label: 'Валюты', icon: '$' },
  { id: 'crypto', label: 'Крипта', icon: 'B' },
];

const calculatorKeys = ['C', '⌫', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '='];

const browserLaunchState: TelegramLaunchState = {
  isTelegram: false,
  colorScheme: 'light',
  platform: 'browser',
  user: null,
  viewportHeight: null,
  stableViewportHeight: null,
};

function formatMoney(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits,
    minimumFractionDigits: value >= 10 ? 2 : 0,
  }).format(value);
}

function formatCompact(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | number | Date) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatUnixDate(value: number | null) {
  return value ? formatDate(value * 1000) : 'время не указано';
}

function getCoin(code: string) {
  return coins.find((coin) => coin.code === code) ?? coins[0];
}

function getCoinPrice(cryptoData: CryptoPrices | null, code: string) {
  return cryptoData?.prices[code] ?? null;
}

function getUsdRate(ratesData: FiatRates | null, code: string) {
  return ratesData?.rates[code] ?? null;
}

function getCurrencyRate(ratesData: FiatRates | null, from: string, to: string) {
  const fromRate = getUsdRate(ratesData, from);
  const toRate = getUsdRate(ratesData, to);

  if (!fromRate || !toRate) return null;
  return toRate / fromRate;
}

function convertCurrency(amount: number, from: string, to: string, ratesData: FiatRates | null) {
  const rate = getCurrencyRate(ratesData, from, to);
  return rate === null ? null : amount * rate;
}

function ChangeBadge({ value }: { value: number }) {
  const isPositive = value >= 0;
  return <span className={`change ${isPositive ? 'positive' : 'negative'}`}>{isPositive ? '+' : ''}{value.toFixed(2)}%</span>;
}

function LiveBadge({ stale }: { stale?: boolean }) {
  return <span className={`live-badge ${stale ? 'stale' : ''}`}>{stale ? 'Кэш' : 'Live'}</span>;
}

function HeroCard({
  label,
  title,
  value,
  aside,
}: {
  label: string;
  title: string;
  value: string;
  aside: string;
}) {
  return (
    <div className="hero-card">
      <div>
        <span>{label}</span>
        <strong>{title}</strong>
      </div>
      <div className="hero-value">
        <strong>{value}</strong>
        <span>{aside}</span>
      </div>
    </div>
  );
}

function MiniStat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`mini-stat ${muted ? 'muted' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Segment<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segment" role="tablist">
      {options.map((option) => (
        <button
          className={option.value === value ? 'active' : ''}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function StatusNotice({ type, children }: { type: 'loading' | 'error' | 'info'; children: ReactNode }) {
  return (
    <div className={`status-notice ${type}`} role={type === 'error' ? 'alert' : 'status'} aria-live="polite">
      {children}
    </div>
  );
}

function LaunchContextCard({ state }: { state: TelegramLaunchState }) {
  const userName = state.user
    ? [state.user.first_name, state.user.last_name].filter(Boolean).join(' ') || state.user.username || `ID ${state.user.id}`
    : null;

  return (
    <div className="launch-context-card" aria-label="Launch context">
      <div>
        <span>{state.isTelegram ? 'Telegram Mini App' : 'Browser mode'}</span>
        <strong>{userName ?? (state.isTelegram ? 'User data unavailable' : 'Local development')}</strong>
      </div>
      <span className="launch-chip">{state.platform}</span>
    </div>
  );
}

function CalculatorScreen({
  ratesData,
  rubRate,
  ratesLoading,
  cryptoData,
  cryptoLoading,
}: {
  ratesData: FiatRates | null;
  rubRate: number | null;
  ratesLoading: boolean;
  cryptoData: CryptoPrices | null;
  cryptoLoading: boolean;
}) {
  const [mode, setMode] = useState<CalculatorMode>('standard');
  const [expression, setExpression] = useState('0');
  const [amount, setAmount] = useState('100');
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('RUB');
  const [coinCode, setCoinCode] = useState('BTC');

  const numericAmount = Number(amount) || 0;
  const btcPrice = getCoinPrice(cryptoData, 'BTC');
  const fiatResult = useMemo(
    () => convertCurrency(numericAmount, fromCurrency, toCurrency, ratesData),
    [fromCurrency, numericAmount, ratesData, toCurrency],
  );
  const cryptoResult = useMemo(() => {
    const price = getCoinPrice(cryptoData, coinCode);
    const usd = price ? numericAmount * price.usd : null;

    return {
      usd,
      rub: price ? numericAmount * price.rub : null,
    };
  }, [coinCode, cryptoData, numericAmount]);

  const pushKey = (key: string) => {
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();

    if (key === 'C') {
      setExpression('0');
      return;
    }

    if (key === '⌫') {
      setExpression((current) => (current.length > 1 ? current.slice(0, -1) : '0'));
      return;
    }

    if (key === '=') {
      const sanitized = expression.replaceAll('×', '*').replaceAll('÷', '/');
      if (!/^[\d+\-*/.()%\s]+$/.test(sanitized)) return;

      try {
        const result = Function(`"use strict"; return (${sanitized})`)();
        setExpression(Number.isFinite(result) ? String(Math.round(result * 100000000) / 100000000) : '0');
      } catch {
        setExpression('0');
      }
      return;
    }

    setExpression((current) => (current === '0' && /[\d.]/.test(key) ? key : `${current}${key}`));
  };

  return (
    <section className="screen calculator-screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Быстро</p>
          <h1>Калькулятор</h1>
          <p className="screen-copy">Считайте суммы и сразу переводите в валюты или крипту.</p>
        </div>
      </header>

      <Segment
        value={mode}
        onChange={setMode}
        options={[
          { value: 'standard', label: 'Обычный' },
          { value: 'fiat', label: 'Валюты' },
          { value: 'crypto', label: 'Крипта' },
        ]}
      />

      <div className="stat-strip">
        <MiniStat label="USD/RUB" value={rubRate ? formatMoney(rubRate, 2) : ratesLoading ? 'Загрузка' : '—'} muted={!rubRate} />
        <MiniStat label="BTC" value={btcPrice ? `$${formatCompact(btcPrice.usd)}` : cryptoLoading ? 'Загрузка' : '—'} muted={!btcPrice} />
      </div>

      {mode === 'standard' && (
        <div className="calculator-pad">
          <div className="display" aria-live="polite">
            <span>Расчет</span>
            <strong>{expression}</strong>
          </div>
          <div className="keys">
            {calculatorKeys.map((key) => (
              <button
                className={`${['÷', '×', '-', '+', '='].includes(key) ? 'operator' : ''} ${key === '=' ? 'equals' : ''}`}
                key={key}
                onClick={() => pushKey(key)}
                type="button"
              >
                {key}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'fiat' && (
        <ConverterPanel amount={amount} setAmount={setAmount}>
          {ratesLoading && !ratesData && <StatusNotice type="loading">Загружаем актуальные курсы...</StatusNotice>}
          <CurrencySelect label="Из" value={fromCurrency} onChange={setFromCurrency} />
          <CurrencySelect label="В" value={toCurrency} onChange={setToCurrency} />
          <ResultValue label="Результат" value={fiatResult === null ? 'Курс недоступен' : `${formatMoney(fiatResult, 4)} ${toCurrency}`} />
        </ConverterPanel>
      )}

      {mode === 'crypto' && (
        <ConverterPanel amount={amount} setAmount={setAmount}>
          {cryptoLoading && !cryptoData && <StatusNotice type="loading">Загружаем цены криптовалют...</StatusNotice>}
          <CoinSelect value={coinCode} onChange={setCoinCode} />
          <ResultValue label="USD" value={cryptoResult.usd === null ? 'Цена загружается' : `$${formatMoney(cryptoResult.usd, 2)}`} />
          <ResultValue label="RUB" value={cryptoResult.rub === null ? 'Цена загружается' : `${formatMoney(cryptoResult.rub, 2)} ₽`} />
        </ConverterPanel>
      )}
    </section>
  );
}

function ConverterPanel({
  amount,
  setAmount,
  children,
}: {
  amount: string;
  setAmount: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="converter-panel">
      <label className="field">
        <span>Сумма</span>
        <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} aria-label="Сумма" />
      </label>
      {children}
    </div>
  );
}

function CurrencySelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
        {currencies.map((currency) => (
          <option value={currency.code} key={currency.code}>
            {currency.code} · {currency.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function CoinSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>Монета</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label="Монета">
        {coins.map((coin) => (
          <option value={coin.code} key={coin.code}>
            {coin.code} · {coin.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function ResultValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="result-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FiatScreen({
  ratesData,
  isLoading,
  error,
  onRefresh,
}: {
  ratesData: FiatRates | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const [baseCurrency, setBaseCurrency] = useState(defaultBaseCurrency);
  const [query, setQuery] = useState('');

  const baseRate = getUsdRate(ratesData, baseCurrency);
  const usdToBase = getCurrencyRate(ratesData, 'USD', baseCurrency);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredCurrencies = currencies.filter((currency) => {
    const searchable = `${currency.code} ${currency.name} ${currency.country}`.toLowerCase();
    return searchable.includes(normalizedQuery);
  });

  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Топ-30</p>
          <h1>Валюты</h1>
          <p className="updated">
            {ratesData ? `Обновлено ${formatDate(ratesData.lastUpdatedAt)}` : isLoading ? 'Загружаем курсы' : 'Курсы пока недоступны'}
          </p>
        </div>
        <button className="icon-button" onClick={onRefresh} type="button" aria-label="Обновить" disabled={isLoading}>
          ↻
        </button>
      </header>

      <HeroCard
        label="Базовая валюта"
        title={baseCurrency}
        value={usdToBase === null ? '—' : `1 USD = ${formatMoney(usdToBase, 4)} ${baseCurrency}`}
        aside={`${filteredCurrencies.length} из ${currencies.length} валют`}
      />

      {isLoading && !ratesData && <StatusNotice type="loading">Получаем свежие курсы валют...</StatusNotice>}
      {error && <StatusNotice type="error">{error}</StatusNotice>}
      {ratesData?.isStale && !error && <StatusNotice type="info">Показываем сохраненные курсы, пока обновление недоступно.</StatusNotice>}
      <a className="source-note" href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">
        Rates by ExchangeRate-API
      </a>

      <div className="toolbar">
        <label className="search">
          <span>⌕</span>
          <input placeholder="USD, EUR, RUB" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Поиск валюты" />
        </label>
        <label className="base-select">
          <span>База</span>
          <select value={baseCurrency} onChange={(event) => setBaseCurrency(event.target.value)} aria-label="Базовая валюта">
            {fiatBaseOptions.map((code) => (
              <option value={code} key={code}>{code}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="market-list">
        {filteredCurrencies.map((currency) => {
          const rateToBase = baseRate ? getCurrencyRate(ratesData, currency.code, baseCurrency) : null;
          return (
            <CurrencyRow
              currency={currency}
              rate={rateToBase}
              baseCode={baseCurrency}
              loading={isLoading && !ratesData}
              stale={ratesData?.isStale}
              key={currency.code}
            />
          );
        })}
        {filteredCurrencies.length === 0 && <div className="empty-state">Валюта не найдена</div>}
      </div>
    </section>
  );
}

function CurrencyRow({
  currency,
  rate,
  baseCode,
  loading,
  stale,
}: {
  currency: Currency;
  rate: number | null;
  baseCode: string;
  loading: boolean;
  stale?: boolean;
}) {
  return (
    <article className="market-row">
      <div className="asset-badge">
        <span>{currency.symbol}</span>
      </div>
      <div className="asset-main">
        <div className="asset-title">
          <strong>{currency.code}</strong>
          <LiveBadge stale={stale} />
        </div>
        <span>{currency.name} · {currency.country}</span>
      </div>
      <div className="asset-price">
        <strong>{loading ? '...' : rate === null ? '—' : formatMoney(rate, 4)}</strong>
        <span>{baseCode}</span>
      </div>
    </article>
  );
}

function CryptoScreen({
  cryptoData,
  isLoading,
  error,
  onRefresh,
}: {
  cryptoData: CryptoPrices | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const [coinCode, setCoinCode] = useState('BTC');
  const [amount, setAmount] = useState('0.25');
  const coin = getCoin(coinCode);
  const selectedPrice = getCoinPrice(cryptoData, coinCode);
  const numericAmount = Number(amount) || 0;
  const usdResult = selectedPrice ? numericAmount * selectedPrice.usd : null;
  const rubResult = selectedPrice ? numericAmount * selectedPrice.rub : null;
  const latestUpdate = Math.max(
    0,
    ...Object.values(cryptoData?.prices ?? {})
      .map((price) => price.lastUpdatedAt ?? 0),
  );

  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Популярное</p>
          <h1>Крипта</h1>
          <p className="screen-copy">
            {cryptoData ? `Обновлено ${formatUnixDate(latestUpdate)}` : isLoading ? 'Загружаем цены' : 'Цены пока недоступны'}
          </p>
        </div>
        <button className="icon-button" onClick={onRefresh} type="button" aria-label="Обновить криптовалюты" disabled={isLoading}>
          ↻
        </button>
      </header>

      {isLoading && !cryptoData && <StatusNotice type="loading">Получаем свежие цены криптовалют...</StatusNotice>}
      {error && <StatusNotice type="error">{error}</StatusNotice>}
      {cryptoData?.isStale && !error && <StatusNotice type="info">Показываем сохраненные цены, пока обновление недоступно.</StatusNotice>}
      <a className="source-note" href="https://www.coingecko.com" target="_blank" rel="noreferrer">
        Prices by CoinGecko
      </a>

      <div className="quick-converter">
        <div className="converter-head">
          <div>
            <span>Быстрый конвертер</span>
            <strong>{coin.name}</strong>
          </div>
          {selectedPrice?.change24h === null || selectedPrice?.change24h === undefined ? <LiveBadge stale={cryptoData?.isStale} /> : <ChangeBadge value={selectedPrice.change24h} />}
        </div>
        <CoinSelect value={coinCode} onChange={setCoinCode} />
        <label className="field">
          <span>Количество</span>
          <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} aria-label="Количество монет" />
        </label>
        <div className="quick-grid">
          <ResultValue label="USD" value={usdResult === null ? 'Цена загружается' : `$${formatMoney(usdResult, 2)}`} />
          <ResultValue label="RUB" value={rubResult === null ? 'Цена загружается' : `${formatMoney(rubResult, 2)} ₽`} />
        </div>
      </div>

      <div className="market-list">
        <div className="section-title">
          <strong>Монеты</strong>
          <span>USD / RUB</span>
        </div>
        {coins.map((item) => (
          <CryptoRow coin={item} price={getCoinPrice(cryptoData, item.code)} loading={isLoading && !cryptoData} stale={cryptoData?.isStale} key={item.code} />
        ))}
      </div>
    </section>
  );
}

function CryptoRow({
  coin,
  price,
  loading,
  stale,
}: {
  coin: Coin;
  price: CryptoPrices['prices'][string] | null;
  loading: boolean;
  stale?: boolean;
}) {
  return (
    <article className={`market-row ${coin.stablecoin ? 'stablecoin-row' : ''}`}>
      <div className={`asset-badge crypto ${coin.stablecoin ? 'stablecoin' : ''}`}>
        <span>{coin.code.slice(0, 2)}</span>
      </div>
      <div className="asset-main">
        <div className="asset-title">
          <strong>{coin.code}</strong>
          {price?.change24h === null || price?.change24h === undefined ? <LiveBadge stale={stale} /> : <ChangeBadge value={price.change24h} />}
        </div>
        <span>{coin.name}{coin.stablecoin ? ' · Stablecoin' : ''}</span>
      </div>
      <div className="asset-price wide">
        <strong>{loading ? '...' : price === null ? '—' : `$${formatCompact(price.usd)}`}</strong>
        <span>{loading ? 'RUB ...' : price === null ? 'RUB —' : `${formatCompact(price.rub)} ₽`}</span>
      </div>
    </article>
  );
}

export default function App() {
  const [tab, setTab] = useState<AppTab>('calculator');
  const [ratesData, setRatesData] = useState<FiatRates | null>(() => getCachedFiatRates({ allowExpired: true }));
  const [ratesLoading, setRatesLoading] = useState(() => !getCachedFiatRates());
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [cryptoData, setCryptoData] = useState<CryptoPrices | null>(() => getCachedCryptoPrices({ allowExpired: true }));
  const [cryptoLoading, setCryptoLoading] = useState(() => !getCachedCryptoPrices());
  const [cryptoError, setCryptoError] = useState<string | null>(null);
  const [telegramState, setTelegramState] = useState<TelegramLaunchState>(browserLaunchState);

  const loadFiatRates = useCallback(async (force = false) => {
    const cached = getCachedFiatRates();

    if (cached && !force) {
      setRatesData(cached);
      setRatesLoading(false);
      setRatesError(null);
      return;
    }

    setRatesLoading(true);
    setRatesError(null);

    try {
      const freshRates = await fetchFiatRates();
      setRatesData(freshRates);
    } catch {
      const fallback = getCachedFiatRates({ allowExpired: true });

      if (fallback) {
        setRatesData({ ...fallback, isStale: true });
        setRatesError('Не удалось обновить курсы. Показываем сохраненные данные.');
      } else {
        setRatesError('Не удалось загрузить курсы. Проверьте соединение и попробуйте обновить.');
      }
    } finally {
      setRatesLoading(false);
    }
  }, []);

  const loadCryptoPrices = useCallback(async (force = false) => {
    const cached = getCachedCryptoPrices();

    if (cached && !force) {
      setCryptoData(cached);
      setCryptoLoading(false);
      setCryptoError(null);
      return;
    }

    setCryptoLoading(true);
    setCryptoError(null);

    try {
      const freshPrices = await fetchCryptoPrices();
      setCryptoData(freshPrices);
    } catch {
      const fallback = getCachedCryptoPrices({ allowExpired: true });

      if (fallback) {
        setCryptoData({ ...fallback, isStale: true });
        setCryptoError('Не удалось обновить криптоцены. Показываем сохраненные данные.');
      } else {
        setCryptoError('Не удалось загрузить криптоцены. Проверьте соединение и попробуйте обновить.');
      }
    } finally {
      setCryptoLoading(false);
    }
  }, []);

  useEffect(() => {
    return initializeTelegramApp(setTelegramState);
  }, []);

  useEffect(() => {
    void loadFiatRates();
  }, [loadFiatRates]);

  useEffect(() => {
    void loadCryptoPrices();
  }, [loadCryptoPrices]);

  const rubRate = getUsdRate(ratesData, 'RUB');

  const screen = {
    calculator: <CalculatorScreen ratesData={ratesData} rubRate={rubRate} ratesLoading={ratesLoading} cryptoData={cryptoData} cryptoLoading={cryptoLoading} />,
    fiat: <FiatScreen ratesData={ratesData} isLoading={ratesLoading} error={ratesError} onRefresh={() => void loadFiatRates(true)} />,
    crypto: <CryptoScreen cryptoData={cryptoData} isLoading={cryptoLoading} error={cryptoError} onRefresh={() => void loadCryptoPrices(true)} />,
  }[tab];

  return (
    <main className="app-shell">
      <div className="app-content">
        <LaunchContextCard state={telegramState} />
        {screen}
      </div>
      <nav className="bottom-nav" aria-label="Основная навигация">
        {navItems.map((item) => (
          <button
            className={tab === item.id ? 'active' : ''}
            key={item.id}
            onClick={() => {
              window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
              setTab(item.id);
            }}
            type="button"
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
