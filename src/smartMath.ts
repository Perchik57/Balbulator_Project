type SmartMathToken =
  | { type: 'number'; value: number }
  | { type: 'operator'; value: '+' | '-' | '*' | '/' };

export type SmartMathResult =
  | { status: 'ok'; value: number }
  | { status: 'empty' | 'incomplete' | 'invalid' | 'division-by-zero' };

function normalizeOperator(value: string) {
  return value === '×' ? '*' : value === '÷' ? '/' : value;
}

function tokenize(expression: string): SmartMathToken[] | null {
  const tokens: SmartMathToken[] = [];
  let index = 0;

  while (index < expression.length) {
    const character = expression[index];

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    const operator = normalizeOperator(character);
    if (operator === '+' || operator === '-' || operator === '*' || operator === '/') {
      tokens.push({ type: 'operator', value: operator });
      index += 1;
      continue;
    }

    if (/\d|\./.test(character)) {
      let numberText = '';
      let decimalCount = 0;

      while (index < expression.length && /[\d.]/.test(expression[index])) {
        if (expression[index] === '.') decimalCount += 1;
        if (decimalCount > 1) return null;

        numberText += expression[index];
        index += 1;
      }

      if (numberText === '.') return null;

      const value = Number(numberText);
      if (!Number.isFinite(value)) return null;

      tokens.push({ type: 'number', value });
      continue;
    }

    return null;
  }

  return tokens;
}

export function evaluateSmartMath(expression: string): SmartMathResult {
  const trimmedExpression = expression.trim();
  if (!trimmedExpression) return { status: 'empty' };

  const tokens = tokenize(trimmedExpression);
  if (!tokens || tokens.length === 0) return { status: 'invalid' };

  let position = 0;
  let dividedByZero = false;

  const peek = () => tokens[position];
  const consume = () => tokens[position++];

  const parseFactor = (): number | null => {
    const token = peek();

    if (token?.type === 'operator' && (token.value === '+' || token.value === '-')) {
      consume();
      const value = parseFactor();
      if (value === null) return null;
      return token.value === '-' ? -value : value;
    }

    if (token?.type !== 'number') return null;

    consume();
    return token.value;
  };

  const parseTerm = (): number | null => {
    let value = parseFactor();
    if (value === null) return null;

    while (peek()?.type === 'operator' && (peek().value === '*' || peek().value === '/')) {
      const operator = consume();
      const right = parseFactor();
      if (operator.type !== 'operator' || right === null) return null;

      if (operator.value === '*') {
        value *= right;
      } else {
        if (right === 0) {
          dividedByZero = true;
          return null;
        }

        value /= right;
      }
    }

    return value;
  };

  const parseExpression = (): number | null => {
    let value = parseTerm();
    if (value === null) return null;

    while (peek()?.type === 'operator' && (peek().value === '+' || peek().value === '-')) {
      const operator = consume();
      const right = parseTerm();
      if (operator.type !== 'operator' || right === null) return null;

      value = operator.value === '+' ? value + right : value - right;
    }

    return value;
  };

  const value = parseExpression();

  if (dividedByZero) return { status: 'division-by-zero' };
  if (value === null) {
    const lastToken = tokens[tokens.length - 1];
    return lastToken.type === 'operator' ? { status: 'incomplete' } : { status: 'invalid' };
  }
  if (position !== tokens.length || !Number.isFinite(value)) return { status: 'invalid' };

  return { status: 'ok', value: Math.round(value * 100000000) / 100000000 };
}
