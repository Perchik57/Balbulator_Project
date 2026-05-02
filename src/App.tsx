import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchCryptoPrices, getCachedCryptoPrices } from './api/cryptoPrices';
import { fetchFiatRates, getCachedFiatRates } from './api/exchangeRates';
import { coins, currencies, defaultBaseCurrency } from './data/markets';
import { useFavorites } from './favorites';
import { evaluateSmartMath } from './smartMath';
import { initializeTelegramApp } from './telegram';
import type { AppTab, CalculatorMode, CalculatorView, Coin, CryptoPrices, Currency, FiatRates, TelegramLaunchState } from './types';

const fiatBaseOptions = ['RUB', 'USD', 'EUR', 'CNY'];
const navItems: Array<{ id: AppTab; label: string; icon: string }> = [
  { id: 'calculator', label: 'Calculator', icon: '=' },
  { id: 'favorites', label: 'Favorites', icon: '★' },
  { id: 'markets', label: 'Markets', icon: '↕' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

const calculatorKeys = ['C', '⌫', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '='];
const flagByCurrency: Record<string, string> = {
  USD: '🇺🇸',
  EUR: '🇪🇺',
  RUB: '🇷🇺',
  GBP: '🇬🇧',
  CNY: '🇨🇳',
  JPY: '🇯🇵',
  CHF: '🇨🇭',
  CAD: '🇨🇦',
  AUD: '🇦🇺',
  HKD: '🇭🇰',
  SGD: '🇸🇬',
  AED: '🇦🇪',
  TRY: '🇹🇷',
  INR: '🇮🇳',
  BRL: '🇧🇷',
  MXN: '🇲🇽',
  KRW: '🇰🇷',
  SEK: '🇸🇪',
  NOK: '🇳🇴',
  DKK: '🇩🇰',
  PLN: '🇵🇱',
  CZK: '🇨🇿',
  HUF: '🇭🇺',
  THB: '🇹🇭',
  ZAR: '🇿🇦',
  ILS: '🇮🇱',
  SAR: '🇸🇦',
  IDR: '🇮🇩',
  MYR: '🇲🇾',
  NZD: '🇳🇿',
};

const browserLaunchState: TelegramLaunchState = {
  isTelegram: false,
  colorScheme: 'light',
  platform: 'browser',
  user: null,
  viewportHeight: null,
  stableViewportHeight: null,
};

type CalculatorSelection = {
  code: string;
  id: number;
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

function formatSmartNumber(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 8,
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
  return value ? formatDate(value * 1000) : 'No timestamp';
}

function getCurrency(code: string) {
  return currencies.find((currency) => currency.code === code) ?? currencies[0];
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

function RateBadge({ label, value, stale }: { label: string; value: string; stale?: boolean }) {
  return (
    <div className={`rate-badge ${stale ? 'stale' : ''}`} aria-live="polite">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LiveBadge({ stale }: { stale?: boolean }) {
  return <span className={`live-badge ${stale ? 'stale' : ''}`}>{stale ? 'Cached' : 'Live'}</span>;
}

function FavoriteStar({ code, label }: { code: string; label?: string }) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const active = isFavorite(code);

  return (
    <button
      className={`favorite-star ${active ? 'active' : ''}`}
      onClick={(event) => {
        event.stopPropagation();
        toggleFavorite(code);
      }}
      type="button"
      aria-label={label ?? `${active ? 'Remove' : 'Add'} ${code} favorite`}
      aria-pressed={active}
    >
      {active ? '★' : '☆'}
    </button>
  );
}

function ScreenHeader({
  eyebrow,
  title,
  meta,
  action,
}: {
  eyebrow: string;
  title: string;
  meta?: string;
  action?: ReactNode;
}) {
  return (
    <header className="screen-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {meta && <p className="screen-meta">{meta}</p>}
      </div>
      {action}
    </header>
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

function NumberDisplay({
  label,
  value,
  result,
  badge,
}: {
  label: string;
  value: string;
  result?: string;
  badge?: ReactNode;
}) {
  return (
    <section className="number-display" aria-live="polite">
      <div className="display-topline">
        <span>{label}</span>
        {badge}
      </div>
      <strong className="display-number" key={value}>
        {value}
        <span className="display-cursor" aria-hidden="true" />
      </strong>
      {result && <p className="conversion-result">{result}</p>}
    </section>
  );
}

function SmartExpressionDisplay({
  value,
  onChange,
  badge,
}: {
  value: string;
  onChange: (value: string) => void;
  badge?: ReactNode;
}) {
  return (
    <section className="number-display smart-expression-display" aria-live="polite">
      <div className="display-topline">
        <span>Smart expression</span>
        {badge}
      </div>
      <input
        className="smart-expression-input"
        value={value}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
        aria-label="Smart expression"
        spellCheck={false}
      />
    </section>
  );
}

function CurrencyChips({
  label,
  value,
  onChange,
  options = currencies,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options?: Currency[];
}) {
  return (
    <div className="chip-group" aria-label={label}>
      <span>{label}</span>
      <div className="chip-row">
        {options.map((currency) => (
          <div className="chip-shell" key={currency.code}>
            <button
              className={`chip currency-chip ${currency.code === value ? 'active' : ''}`}
              onClick={() => onChange(currency.code)}
              type="button"
            >
              <span aria-hidden="true">{flagByCurrency[currency.code] ?? '¤'}</span>
              <strong>{currency.code}</strong>
            </button>
            <FavoriteStar code={currency.code} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CoinChips({ value, onChange, options = coins }: { value: string; onChange: (value: string) => void; options?: Coin[] }) {
  return (
    <div className="chip-group" aria-label="Coin">
      <span>Coin</span>
      <div className="chip-row">
        {options.map((coin) => (
          <div className="chip-shell" key={coin.code}>
            <button
              className={`chip coin-chip ${coin.code === value ? 'active' : ''}`}
              onClick={() => onChange(coin.code)}
              type="button"
            >
              <strong>{coin.code}</strong>
            </button>
            <FavoriteStar code={coin.code} />
          </div>
        ))}
      </div>
    </div>
  );
}

function MyFavoritesRow({ onSelect }: { onSelect: (code: string) => void }) {
  const { favorites } = useFavorites();
  const visibleFavorites = favorites.filter((code) => currencies.some((currency) => currency.code === code) || coins.some((coin) => coin.code === code));

  if (visibleFavorites.length === 0) return null;

  return (
    <div className="chip-group my-favorites" aria-label="My Favorites">
      <span>My Favorites</span>
      <div className="chip-row">
        {visibleFavorites.map((code) => {
          const currency = getCurrency(code);
          const isCurrency = currencies.some((item) => item.code === code);
          return (
            <button className="chip favorite-chip" key={code} onClick={() => onSelect(code)} type="button">
              <span aria-hidden="true">{isCurrency ? flagByCurrency[code] ?? currency.symbol : getCoin(code).code.slice(0, 2)}</span>
              <strong>{code}</strong>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Keypad({ onPress }: { onPress: (key: string) => void }) {
  return (
    <div className="keypad" aria-label="Calculator keypad">
      {calculatorKeys.map((key) => (
        <button
          className={`${['÷', '×', '-', '+', '='].includes(key) ? 'operator' : ''} ${key === '=' ? 'equals' : ''}`}
          key={key}
          onClick={() => onPress(key)}
          type="button"
        >
          {key}
        </button>
      ))}
    </div>
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

function SmartResultPanel({
  value,
  detail,
  secondaryResults,
  onSelectSecondary,
}: {
  value: string;
  detail: string;
  secondaryResults: Array<{ code: string; value: string }>;
  onSelectSecondary: (code: string) => void;
}) {
  return (
    <section className="smart-result-panel" aria-live="polite">
      <span>Primary result</span>
      <strong>{value}</strong>
      <p>{detail}</p>
      {secondaryResults.length > 0 && (
        <div className="smart-secondary-row" aria-label="Favorite currency results">
          {secondaryResults.map((result) => (
            <button className="smart-secondary-chip" key={result.code} onClick={() => onSelectSecondary(result.code)} type="button">
              <span>{result.code}</span>
              <strong>{result.value}</strong>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function CalculatorScreen({
  ratesData,
  rubRate,
  ratesLoading,
  cryptoData,
  cryptoLoading,
  selection,
}: {
  ratesData: FiatRates | null;
  rubRate: number | null;
  ratesLoading: boolean;
  cryptoData: CryptoPrices | null;
  cryptoLoading: boolean;
  selection: CalculatorSelection | null;
}) {
  const [calculatorView, setCalculatorView] = useState<CalculatorView>('simple');
  const [mode, setMode] = useState<CalculatorMode>('standard');
  const [expression, setExpression] = useState('0');
  const [smartExpression, setSmartExpression] = useState('0');
  const [amount, setAmount] = useState('100');
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('RUB');
  const [coinCode, setCoinCode] = useState('BTC');
  const { favorites } = useFavorites();

  const selectFavoriteInCalculator = useCallback((code: string) => {
    if (currencies.some((currency) => currency.code === code)) {
      setMode('fiat');
      setFromCurrency(code);
      return;
    }

    if (coins.some((coinItem) => coinItem.code === code)) {
      setMode('crypto');
      setCoinCode(code);
    }
  }, []);

  useEffect(() => {
    if (selection) {
      selectFavoriteInCalculator(selection.code);
    }
  }, [selection, selectFavoriteInCalculator]);

  const numericAmount = Number(amount) || 0;
  const coin = getCoin(coinCode);
  const coinPrice = getCoinPrice(cryptoData, coinCode);
  const fiatRate = getCurrencyRate(ratesData, fromCurrency, toCurrency);
  const fiatResult = useMemo(
    () => convertCurrency(numericAmount, fromCurrency, toCurrency, ratesData),
    [fromCurrency, numericAmount, ratesData, toCurrency],
  );
  const cryptoResult = useMemo(() => {
    const price = getCoinPrice(cryptoData, coinCode);
    return price ? numericAmount * price.usd : null;
  }, [coinCode, cryptoData, numericAmount]);
  const makeSmartConverter = useCallback(
    (targetCode: string) => ({ amount, code }: { amount: number; code: string }) => {
      const normalizedCode = code.toUpperCase();

      if (currencies.some((currency) => currency.code === normalizedCode)) {
        return convertCurrency(amount, normalizedCode, targetCode, ratesData);
      }

      if (coins.some((coinItem) => coinItem.code === normalizedCode)) {
        const price = getCoinPrice(cryptoData, normalizedCode);
        if (!price) return null;

        if (targetCode === 'USD') return amount * price.usd;
        if (targetCode === 'RUB') return amount * price.rub;

        return convertCurrency(amount * price.usd, 'USD', targetCode, ratesData);
      }

      return null;
    },
    [cryptoData, ratesData],
  );
  const convertSmartOperand = useMemo(
    () => makeSmartConverter(toCurrency),
    [makeSmartConverter, toCurrency],
  );
  const smartMathResult = useMemo(
    () => evaluateSmartMath(smartExpression, {
      sourceCode: fromCurrency,
      targetCode: toCurrency,
      convert: convertSmartOperand,
      format: formatSmartNumber,
    }),
    [convertSmartOperand, fromCurrency, smartExpression, toCurrency],
  );
  const secondarySmartResults = useMemo(() => {
    if (smartMathResult.status !== 'ok') return [];

    return favorites
      .filter((code) => code !== toCurrency && currencies.some((currency) => currency.code === code))
      .slice(0, 3)
      .map((code) => {
        const result = evaluateSmartMath(smartExpression, {
          sourceCode: fromCurrency,
          targetCode: code,
          convert: makeSmartConverter(code),
          format: formatSmartNumber,
        });

        return result.status === 'ok'
          ? { code, value: `${formatMoney(result.value, 4)} ${code}` }
          : null;
      })
      .filter((result): result is { code: string; value: string } => result !== null);
  }, [favorites, fromCurrency, makeSmartConverter, smartExpression, smartMathResult.status, toCurrency]);

  const smartResult = (() => {
    if (smartMathResult.status === 'empty' || smartMathResult.status === 'incomplete') {
      return {
        value: 'Enter an expression',
        detail: `${fromCurrency} to ${toCurrency}`,
      };
    }

    if (smartMathResult.status === 'invalid') {
      return {
        value: 'Invalid expression',
        detail: 'Use numbers, currency codes, and +, -, *, /',
      };
    }

    if (smartMathResult.status === 'division-by-zero') {
      return {
        value: 'Cannot divide by zero',
        detail: 'Adjust the divisor',
      };
    }

    if (smartMathResult.status === 'rate-unavailable') {
      return {
        value: 'Rate unavailable',
        detail: `${fromCurrency} to ${toCurrency}`,
      };
    }

    if (smartMathResult.status !== 'ok') {
      return {
        value: 'Invalid expression',
        detail: 'Use numbers, currency codes, and +, -, *, /',
      };
    }

    return {
      value: `${formatMoney(smartMathResult.value, 4)} ${toCurrency}`,
      detail: smartMathResult.breakdown,
    };
  })();

  const displayValue = mode === 'standard' ? expression : amount;
  const displayResult = mode === 'fiat'
    ? `= ${fiatResult === null ? 'Rate unavailable' : `${formatMoney(fiatResult, 4)} ${toCurrency}`}`
    : mode === 'crypto'
      ? `= ${cryptoResult === null ? 'Price loading' : `$${formatMoney(cryptoResult, 2)}`}`
      : undefined;
  const displayBadge = mode === 'fiat'
    ? <RateBadge label={`${fromCurrency}/${toCurrency}`} value={fiatRate === null ? '...' : formatMoney(fiatRate, 4)} stale={ratesData?.isStale} />
    : mode === 'crypto'
      ? <RateBadge label={coin.code} value={coinPrice ? `$${formatCompact(coinPrice.usd)}` : cryptoLoading ? '...' : '—'} stale={cryptoData?.isStale} />
      : <RateBadge label="USD/RUB" value={rubRate ? formatMoney(rubRate, 2) : ratesLoading ? '...' : '—'} stale={ratesData?.isStale} />;

  const setNumericInput = (key: string) => {
    if (key === 'C') {
      setAmount('0');
      return;
    }

    if (key === '⌫') {
      setAmount((current) => (current.length > 1 ? current.slice(0, -1) : '0'));
      return;
    }

    if (key === '.' && amount.includes('.')) return;
    if (!/^\d|\.$/.test(key)) return;
    setAmount((current) => (current === '0' && key !== '.' ? key : `${current}${key}`));
  };

  const pushSmartKey = (key: string) => {
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();

    if (key === 'C') {
      setSmartExpression('0');
      return;
    }

    if (key === '⌫') {
      setSmartExpression((current) => (current.length > 1 ? current.slice(0, -1) : '0'));
      return;
    }

    if (key === '=' || key === '%') return;

    const normalizedKey = key === '×' ? '*' : key === '÷' ? '/' : key;
    const isDigit = /^\d$/.test(normalizedKey);
    const isOperator = ['+', '-', '*', '/'].includes(normalizedKey);

    if (!isDigit && normalizedKey !== '.' && !isOperator) return;

    setSmartExpression((current) => {
      if (isDigit) {
        return current === '0' ? normalizedKey : `${current}${normalizedKey}`;
      }

      if (normalizedKey === '.') {
        const currentParts = current.split(/[+\-*/]/);
        const currentNumber = currentParts[currentParts.length - 1] ?? '';
        if (currentNumber.includes('.')) return current;
        return `${current}.`;
      }

      if (isOperator) {
        if (/[+\-*/.]$/.test(current)) {
          return normalizedKey === '-' && /[*+/]$/.test(current)
            ? `${current}${normalizedKey}`
            : `${current.slice(0, -1)}${normalizedKey}`;
        }

        return `${current}${normalizedKey}`;
      }

      return current;
    });
  };

  const pushKey = (key: string) => {
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();

    if (mode !== 'standard') {
      setNumericInput(key);
      return;
    }

    if (key === 'C') {
      setExpression('0');
      return;
    }

    if (key === '⌫') {
      setExpression((current) => (current.length > 1 ? current.slice(0, -1) : '0'));
      return;
    }

    if (key === '=') {
      const sanitized = expression.split('×').join('*').split('÷').join('/');
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
      <ScreenHeader eyebrow="Balbulator" title="Calculator" meta={calculatorView === 'smart' ? 'Smart conversion' : mode === 'standard' ? 'Standard' : mode === 'fiat' ? 'Fiat conversion' : 'Crypto conversion'} />

      <Segment
        value={calculatorView}
        onChange={setCalculatorView}
        options={[
          { value: 'simple', label: 'Simple' },
          { value: 'smart', label: 'Smart' },
        ]}
      />

      {calculatorView === 'simple' ? (
        <>
          <NumberDisplay label={mode === 'standard' ? 'Expression' : 'Amount'} value={displayValue} result={displayResult} badge={displayBadge} />

          <Segment
            value={mode}
            onChange={setMode}
            options={[
              { value: 'standard', label: 'Calc' },
              { value: 'fiat', label: 'Fiat' },
              { value: 'crypto', label: 'Crypto' },
            ]}
          />

          {mode === 'fiat' && (
            <div className="glass-card stack">
              <MyFavoritesRow onSelect={selectFavoriteInCalculator} />
              <CurrencyChips label="From" value={fromCurrency} onChange={setFromCurrency} options={currencies.slice(0, 12)} />
              <CurrencyChips label="To" value={toCurrency} onChange={setToCurrency} options={currencies.slice(0, 12)} />
            </div>
          )}

          {mode === 'crypto' && (
            <div className="glass-card stack">
              <MyFavoritesRow onSelect={selectFavoriteInCalculator} />
              <CoinChips value={coinCode} onChange={setCoinCode} />
              <ResultValue label="RUB" value={coinPrice ? `${formatMoney(numericAmount * coinPrice.rub, 2)} ₽` : 'Price loading'} />
            </div>
          )}

          <Keypad onPress={pushKey} />
        </>
      ) : (
        <>
          <SmartExpressionDisplay
            value={smartExpression}
            onChange={setSmartExpression}
            badge={<RateBadge label={`${fromCurrency}/${toCurrency}`} value={fiatRate === null ? '...' : formatMoney(fiatRate, 4)} stale={ratesData?.isStale} />}
          />

          <SmartResultPanel
            value={smartResult.value}
            detail={smartResult.detail}
            secondaryResults={secondarySmartResults}
            onSelectSecondary={setToCurrency}
          />

          <div className="glass-card stack smart-converter-controls">
            <CurrencyChips label="From" value={fromCurrency} onChange={setFromCurrency} options={currencies.slice(0, 12)} />
            <CurrencyChips label="To" value={toCurrency} onChange={setToCurrency} options={currencies.slice(0, 12)} />
          </div>

          <Keypad onPress={pushSmartKey} />
        </>
      )}
    </section>
  );
}

function FavoriteCard({
  code,
  ratesData,
  cryptoData,
  onSelect,
}: {
  code: string;
  ratesData: FiatRates | null;
  cryptoData: CryptoPrices | null;
  onSelect: (code: string) => void;
}) {
  const currency = currencies.find((item) => item.code === code);
  const coin = coins.find((item) => item.code === code);
  const cryptoPrice = coin ? getCoinPrice(cryptoData, coin.code) : null;
  const rateVsUsd = currency
    ? getUsdRate(ratesData, currency.code)
    : cryptoPrice?.usd ?? null;
  const title = currency?.code ?? coin?.code ?? code;
  const name = currency?.name ?? coin?.name ?? 'Unknown asset';
  const marker = currency ? flagByCurrency[currency.code] ?? currency.symbol : coin?.code.slice(0, 2) ?? '¤';
  const rateLabel = currency
    ? rateVsUsd === null ? 'USD rate unavailable' : `1 USD = ${formatMoney(rateVsUsd, 4)} ${currency.code}`
    : rateVsUsd === null ? 'USD price unavailable' : `$${formatMoney(rateVsUsd, 2)}`;

  return (
    <article className="favorite-card">
      <button className="favorite-card-main" onClick={() => onSelect(code)} type="button">
        <span className={`favorite-card-icon ${coin ? 'crypto' : ''}`}>{marker}</span>
        <strong>{title}</strong>
        <span>{name}</span>
        <em>{rateLabel}</em>
      </button>
      <FavoriteStar code={code} label={`Remove ${code} favorite`} />
    </article>
  );
}

function FavoritesScreen({
  ratesData,
  cryptoData,
  onSelectFavorite,
}: {
  ratesData: FiatRates | null;
  cryptoData: CryptoPrices | null;
  onSelectFavorite: (code: string) => void;
}) {
  const { favorites } = useFavorites();
  const visibleFavorites = favorites.filter((code) => currencies.some((currency) => currency.code === code) || coins.some((coin) => coin.code === code));

  return (
    <section className="screen">
      <ScreenHeader eyebrow="Pinned" title="Favorites" meta={`${visibleFavorites.length} tracked assets`} />

      {visibleFavorites.length === 0 ? (
        <div className="empty-state favorites-empty">No favorites yet. Star a currency to add it here</div>
      ) : (
        <div className="favorite-grid">
          {visibleFavorites.map((code) => (
            <FavoriteCard code={code} ratesData={ratesData} cryptoData={cryptoData} onSelect={onSelectFavorite} key={code} />
          ))}
        </div>
      )}
    </section>
  );
}

function MarketsScreen({
  ratesData,
  ratesLoading,
  ratesError,
  cryptoData,
  cryptoLoading,
  cryptoError,
  onRefreshRates,
  onRefreshCrypto,
}: {
  ratesData: FiatRates | null;
  ratesLoading: boolean;
  ratesError: string | null;
  cryptoData: CryptoPrices | null;
  cryptoLoading: boolean;
  cryptoError: string | null;
  onRefreshRates: () => void;
  onRefreshCrypto: () => void;
}) {
  const [marketType, setMarketType] = useState<'fiat' | 'crypto'>('fiat');
  const [baseCurrency, setBaseCurrency] = useState(defaultBaseCurrency);
  const [query, setQuery] = useState('');
  const baseRate = getUsdRate(ratesData, baseCurrency);
  const latestUpdate = Math.max(
    0,
    ...Object.values(cryptoData?.prices ?? {})
      .map((price) => price.lastUpdatedAt ?? 0),
  );

  const normalizedQuery = query.trim().toLowerCase();
  const filteredCurrencies = currencies.filter((currency) => {
    const searchable = `${currency.code} ${currency.name} ${currency.country}`.toLowerCase();
    return searchable.includes(normalizedQuery);
  });
  const filteredCoins = coins.filter((coin) => `${coin.code} ${coin.name}`.toLowerCase().includes(normalizedQuery));

  return (
    <section className="screen">
      <ScreenHeader
        eyebrow="Live rates"
        title="Markets"
        meta={marketType === 'fiat'
          ? ratesData ? `Updated ${formatDate(ratesData.lastUpdatedAt)}` : ratesLoading ? 'Loading fiat rates' : 'Fiat unavailable'
          : cryptoData ? `Updated ${formatUnixDate(latestUpdate)}` : cryptoLoading ? 'Loading crypto prices' : 'Crypto unavailable'}
        action={(
          <button className="icon-button" onClick={marketType === 'fiat' ? onRefreshRates : onRefreshCrypto} type="button" aria-label="Refresh" disabled={marketType === 'fiat' ? ratesLoading : cryptoLoading}>
            ↻
          </button>
        )}
      />

      <Segment
        value={marketType}
        onChange={setMarketType}
        options={[
          { value: 'fiat', label: 'Fiat' },
          { value: 'crypto', label: 'Crypto' },
        ]}
      />

      {(ratesLoading && !ratesData && marketType === 'fiat') && <StatusNotice type="loading">Loading fiat rates...</StatusNotice>}
      {(cryptoLoading && !cryptoData && marketType === 'crypto') && <StatusNotice type="loading">Loading crypto prices...</StatusNotice>}
      {marketType === 'fiat' && ratesError && <StatusNotice type="error">{ratesError}</StatusNotice>}
      {marketType === 'crypto' && cryptoError && <StatusNotice type="error">{cryptoError}</StatusNotice>}
      {marketType === 'fiat' && ratesData?.isStale && !ratesError && <StatusNotice type="info">Showing cached fiat rates.</StatusNotice>}
      {marketType === 'crypto' && cryptoData?.isStale && !cryptoError && <StatusNotice type="info">Showing cached crypto prices.</StatusNotice>}

      <div className="toolbar">
        <label className="search">
          <span>⌕</span>
          <input placeholder="Search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search markets" />
        </label>
        {marketType === 'fiat' && (
          <div className="base-chips">
            {fiatBaseOptions.map((code) => (
              <button className={code === baseCurrency ? 'active' : ''} key={code} onClick={() => setBaseCurrency(code)} type="button">
                {code}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="market-list">
        {marketType === 'fiat' && filteredCurrencies.map((currency) => {
          const rateToBase = baseRate ? getCurrencyRate(ratesData, currency.code, baseCurrency) : null;
          return (
            <CurrencyRow
              currency={currency}
              rate={rateToBase}
              baseCode={baseCurrency}
              loading={ratesLoading && !ratesData}
              stale={ratesData?.isStale}
              key={currency.code}
            />
          );
        })}

        {marketType === 'crypto' && filteredCoins.map((coin) => (
          <CryptoRow coin={coin} price={getCoinPrice(cryptoData, coin.code)} loading={cryptoLoading && !cryptoData} stale={cryptoData?.isStale} key={coin.code} />
        ))}

        {(marketType === 'fiat' ? filteredCurrencies.length : filteredCoins.length) === 0 && <div className="empty-state">No matches</div>}
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
        <span>{flagByCurrency[currency.code] ?? currency.symbol}</span>
      </div>
      <div className="asset-main">
        <div className="asset-title">
          <strong>{currency.code}</strong>
          <LiveBadge stale={stale} />
        </div>
        <span>{currency.name}</span>
      </div>
      <div className="asset-price">
        <strong>{loading ? '...' : rate === null ? '—' : formatMoney(rate, 4)}</strong>
        <span>{baseCode}</span>
      </div>
      <FavoriteStar code={currency.code} />
    </article>
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
      <FavoriteStar code={coin.code} />
    </article>
  );
}

function SettingsScreen({
  telegramState,
  ratesData,
  cryptoData,
}: {
  telegramState: TelegramLaunchState;
  ratesData: FiatRates | null;
  cryptoData: CryptoPrices | null;
}) {
  const userName = telegramState.user
    ? [telegramState.user.first_name, telegramState.user.last_name].filter(Boolean).join(' ') || telegramState.user.username || `ID ${telegramState.user.id}`
    : telegramState.isTelegram ? 'Telegram user' : 'Local development';

  return (
    <section className="screen">
      <ScreenHeader eyebrow="Preferences" title="Settings" meta={telegramState.isTelegram ? 'Telegram Mini App' : 'Browser mode'} />

      <div className="glass-card settings-card">
        <div>
          <span>Profile</span>
          <strong>{userName}</strong>
        </div>
        <span className="settings-chip">{telegramState.platform}</span>
      </div>

      <div className="settings-list">
        <ResultValue label="Theme" value={telegramState.colorScheme} />
        <ResultValue label="Fiat source" value={ratesData?.provider ?? 'ExchangeRate-API'} />
        <ResultValue label="Crypto source" value={cryptoData?.provider ?? 'CoinGecko'} />
        <ResultValue label="Fiat cache" value={ratesData?.isStale ? 'Cached' : ratesData ? 'Live' : 'Empty'} />
        <ResultValue label="Crypto cache" value={cryptoData?.isStale ? 'Cached' : cryptoData ? 'Live' : 'Empty'} />
      </div>
    </section>
  );
}

export default function App() {
  const { favorites } = useFavorites();
  const [tab, setTab] = useState<AppTab>('calculator');
  const [calculatorSelection, setCalculatorSelection] = useState<CalculatorSelection | null>(null);
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
        setRatesError('Could not refresh fiat rates. Showing cached data.');
      } else {
        setRatesError('Could not load fiat rates.');
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
        setCryptoError('Could not refresh crypto prices. Showing cached data.');
      } else {
        setCryptoError('Could not load crypto prices.');
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
  const selectFavoriteInCalculator = (code: string) => {
    setCalculatorSelection({ code, id: Date.now() });
    setTab('calculator');
  };

  const screen = {
    calculator: (
      <CalculatorScreen
        ratesData={ratesData}
        rubRate={rubRate}
        ratesLoading={ratesLoading}
        cryptoData={cryptoData}
        cryptoLoading={cryptoLoading}
        selection={calculatorSelection}
      />
    ),
    favorites: <FavoritesScreen ratesData={ratesData} cryptoData={cryptoData} onSelectFavorite={selectFavoriteInCalculator} />,
    markets: (
      <MarketsScreen
        ratesData={ratesData}
        ratesLoading={ratesLoading}
        ratesError={ratesError}
        cryptoData={cryptoData}
        cryptoLoading={cryptoLoading}
        cryptoError={cryptoError}
        onRefreshRates={() => void loadFiatRates(true)}
        onRefreshCrypto={() => void loadCryptoPrices(true)}
      />
    ),
    settings: <SettingsScreen telegramState={telegramState} ratesData={ratesData} cryptoData={cryptoData} />,
  }[tab];

  return (
    <main className="app-shell">
      <div className="app-content">{screen}</div>
      <nav className="bottom-nav" aria-label="Main navigation">
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
            {item.id === 'favorites' && favorites.length > 0 && <span className="nav-badge">{favorites.length}</span>}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
