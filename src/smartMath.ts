type SmartOperator = '+' | '-' | '*' | '/';

type SmartMathToken =
  | { type: 'number'; value: number; code?: string; raw: string }
  | { type: 'operator'; value: SmartOperator };

type SmartAstNode =
  | { type: 'amount'; value: number; code?: string; raw: string }
  | { type: 'unary'; operator: '+' | '-'; value: SmartAstNode }
  | { type: 'binary'; operator: SmartOperator; left: SmartAstNode; right: SmartAstNode };

type ScalarValue = { type: 'scalar'; value: number; expression: string };

type MoneyValue = { type: 'money'; value: number; expression: string; conversions: string[] };

type EvaluatedValue = ScalarValue | MoneyValue;

export type SmartConversionRequest = {
  amount: number;
  code: string;
};

export type SmartMathOptions = {
  sourceCode: string;
  targetCode: string;
  convert: (request: SmartConversionRequest) => number | null;
  format: (value: number) => string;
};

export type SmartMathResult =
  | { status: 'ok'; value: number; breakdown: string }
  | { status: 'empty' | 'incomplete' | 'invalid' | 'division-by-zero' | 'rate-unavailable' };

function normalizeOperator(value: string) {
  return value === '×' ? '*' : value === '÷' ? '/' : value;
}

function displayOperator(operator: SmartOperator) {
  return operator === '*' ? '×' : operator === '/' ? '÷' : operator;
}

function roundResult(value: number) {
  return Math.round(value * 100000000) / 100000000;
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

      while (index < expression.length && /\s/.test(expression[index])) {
        index += 1;
      }

      let code = '';
      while (index < expression.length && /[a-z]/i.test(expression[index])) {
        code += expression[index].toUpperCase();
        index += 1;
      }

      tokens.push({ type: 'number', value, code: code || undefined, raw: numberText });
      continue;
    }

    return null;
  }

  return tokens;
}

function parseTokens(tokens: SmartMathToken[]) {
  let position = 0;

  const peek = () => tokens[position];
  const consume = () => tokens[position++];

  const parseFactor = (): SmartAstNode | null => {
    const token = peek();

    if (token?.type === 'operator' && (token.value === '+' || token.value === '-')) {
      consume();
      const value = parseFactor();
      return value ? { type: 'unary', operator: token.value, value } : null;
    }

    if (token?.type !== 'number') return null;

    consume();
    return { type: 'amount', value: token.value, code: token.code, raw: token.raw };
  };

  const parseTerm = (): SmartAstNode | null => {
    let value = parseFactor();
    if (!value) return null;

    while (peek()?.type === 'operator' && (peek().value === '*' || peek().value === '/')) {
      const operator = consume();
      const right = parseFactor();
      if (operator.type !== 'operator' || !right) return null;

      value = { type: 'binary', operator: operator.value, left: value, right };
    }

    return value;
  };

  const parseExpression = (): SmartAstNode | null => {
    let value = parseTerm();
    if (!value) return null;

    while (peek()?.type === 'operator' && (peek().value === '+' || peek().value === '-')) {
      const operator = consume();
      const right = parseTerm();
      if (operator.type !== 'operator' || !right) return null;

      value = { type: 'binary', operator: operator.value, left: value, right };
    }

    return value;
  };

  const ast = parseExpression();
  if (!ast || position !== tokens.length) return null;

  return ast;
}

function hasCurrencyCode(node: SmartAstNode): boolean {
  if (node.type === 'amount') return !!node.code;
  if (node.type === 'unary') return hasCurrencyCode(node.value);
  return hasCurrencyCode(node.left) || hasCurrencyCode(node.right);
}

function buildBreakdown(value: EvaluatedValue, finalValue: number, options: SmartMathOptions) {
  const finalText = `${options.format(finalValue)} ${options.targetCode}`;
  const conversions = value.type === 'money' ? value.conversions : [];

  if (conversions.length === 0) {
    return finalText;
  }

  return `${conversions.join(' | ')} -> ${value.expression} = ${finalText}`;
}

function conversionText(amount: number, code: string, converted: number, options: SmartMathOptions) {
  return `${options.format(amount)} ${code} = ${options.format(converted)} ${options.targetCode}`;
}

function evaluateNode(node: SmartAstNode, options: SmartMathOptions): EvaluatedValue | null {
  if (node.type === 'amount') {
    if (!node.code) {
      return { type: 'scalar', value: node.value, expression: options.format(node.value) };
    }

    const converted = options.convert({ amount: node.value, code: node.code });
    if (converted === null) return null;

    return {
      type: 'money',
      value: converted,
      expression: options.format(converted),
      conversions: [conversionText(node.value, node.code, converted, options)],
    };
  }

  if (node.type === 'unary') {
    const value = evaluateNode(node.value, options);
    if (!value) return null;

    const signedValue = node.operator === '-' ? -value.value : value.value;
    const expression = `${node.operator}${value.expression}`;

    return value.type === 'money'
      ? { type: 'money', value: signedValue, expression, conversions: value.conversions }
      : { type: 'scalar', value: signedValue, expression };
  }

  const left = evaluateNode(node.left, options);
  const right = evaluateNode(node.right, options);
  if (!left || !right) return null;

  if (node.operator === '+' || node.operator === '-') {
    const leftMoney = ensureMoney(left, options);
    const rightMoney = ensureMoney(right, options);
    if (!leftMoney || !rightMoney) return null;

    const value = node.operator === '+'
      ? leftMoney.value + rightMoney.value
      : leftMoney.value - rightMoney.value;

    return {
      type: 'money',
      value,
      expression: `${leftMoney.expression} ${displayOperator(node.operator)} ${rightMoney.expression}`,
      conversions: [...leftMoney.conversions, ...rightMoney.conversions],
    };
  }

  if (node.operator === '*') {
    if (left.type === 'money' && right.type === 'scalar') {
      return {
        type: 'money',
        value: left.value * right.value,
        expression: `${left.expression} × ${right.expression}`,
        conversions: left.conversions,
      };
    }

    if (left.type === 'scalar' && right.type === 'money') {
      return {
        type: 'money',
        value: left.value * right.value,
        expression: `${left.expression} × ${right.expression}`,
        conversions: right.conversions,
      };
    }

    if (left.type === 'scalar' && right.type === 'scalar') {
      return {
        type: 'scalar',
        value: left.value * right.value,
        expression: `${left.expression} × ${right.expression}`,
      };
    }

    return null;
  }

  if (right.value === 0) {
    return { type: 'scalar', value: Number.NaN, expression: '' };
  }

  if (left.type === 'money' && right.type === 'scalar') {
    return {
      type: 'money',
      value: left.value / right.value,
      expression: `${left.expression} ÷ ${right.expression}`,
      conversions: left.conversions,
    };
  }

  if (left.type === 'scalar' && right.type === 'scalar') {
    return {
      type: 'scalar',
      value: left.value / right.value,
      expression: `${left.expression} ÷ ${right.expression}`,
    };
  }

  return null;
}

function ensureMoney(value: EvaluatedValue, options: SmartMathOptions): MoneyValue | null {
  if (value.type === 'money') return value;

  const converted = options.convert({ amount: value.value, code: options.sourceCode });
  if (converted === null) return null;

  return {
    type: 'money',
    value: converted,
    expression: options.format(converted),
    conversions: [conversionText(value.value, options.sourceCode, converted, options)],
  };
}

function evaluateScalar(node: SmartAstNode): number | null {
  if (node.type === 'amount') return node.code ? null : node.value;

  if (node.type === 'unary') {
    const value = evaluateScalar(node.value);
    if (value === null) return null;
    return node.operator === '-' ? -value : value;
  }

  const left = evaluateScalar(node.left);
  const right = evaluateScalar(node.right);
  if (left === null || right === null) return null;

  if (node.operator === '+') return left + right;
  if (node.operator === '-') return left - right;
  if (node.operator === '*') return left * right;
  if (right === 0) return Number.NaN;
  return left / right;
}

export function evaluateSmartMath(expression: string, options: SmartMathOptions): SmartMathResult {
  const trimmedExpression = expression.trim();
  if (!trimmedExpression) return { status: 'empty' };

  const tokens = tokenize(trimmedExpression);
  if (!tokens || tokens.length === 0) return { status: 'invalid' };

  const lastToken = tokens[tokens.length - 1];
  if (lastToken.type === 'operator') return { status: 'incomplete' };

  const ast = parseTokens(tokens);
  if (!ast) return { status: 'invalid' };

  if (!hasCurrencyCode(ast)) {
    const scalar = evaluateScalar(ast);
    if (scalar === null) return { status: 'invalid' };
    if (Number.isNaN(scalar)) return { status: 'division-by-zero' };
    if (!Number.isFinite(scalar)) return { status: 'invalid' };

    const converted = options.convert({ amount: scalar, code: options.sourceCode });
    if (converted === null) return { status: 'rate-unavailable' };

    const rounded = roundResult(converted);
    return {
      status: 'ok',
      value: rounded,
      breakdown: `${options.format(scalar)} ${options.sourceCode} = ${options.format(rounded)} ${options.targetCode}`,
    };
  }

  const evaluated = evaluateNode(ast, options);
  if (!evaluated) return { status: 'rate-unavailable' };
  if (Number.isNaN(evaluated.value)) return { status: 'division-by-zero' };
  if (!Number.isFinite(evaluated.value)) return { status: 'invalid' };

  const money = evaluated.type === 'money' ? evaluated : ensureMoney(evaluated, options);
  if (!money) return { status: 'rate-unavailable' };

  const rounded = roundResult(money.value);
  return {
    status: 'ok',
    value: rounded,
    breakdown: buildBreakdown(money, rounded, options),
  };
}
