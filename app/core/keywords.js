const DEFAULT_FINANCIAL_TERMS = [
  'deuda',
  'deudas',
  'interes',
  'interés',
  'sueldo',
  'sueldos',
  'salario',
  'impuesto',
  'impuestos',
  'ahorro',
  'ahorros',
  'inflación',
  'inflacion',
  'crédito',
  'credito',
  'préstamo',
  'prestamo',
  'hipoteca',
  'tarjeta',
  'banco',
  'dinero',
  'pago',
  'pagos',
  'cuota',
  'cuotas',
  'renta',
  'ganancia',
  'ganancias',
  'pérdida',
  'perdida',
  'inversión',
  'inversion',
  'ingreso',
  'ingresos',
  'efectivo',
  'costo',
  'costos',
  'precio',
  'precios',
  'descuento',
  'oferta'
];

const DEFAULT_HIGHLIGHT_COLOR = '#ff0000';

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectKeywords(texts, options = {}) {
  const {
    terms = DEFAULT_FINANCIAL_TERMS,
    numbers = true,
    percent = true,
    currency = true
  } = options;

  const text = Array.isArray(texts) ? texts.join('\n') : String(texts == null ? '' : texts);
  const found = new Map();
  const add = (value, kind) => {
    const clean = String(value).trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!found.has(key)) found.set(key, { term: clean, kind });
  };
  const collect = (regex) => {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      add(match[0], match[0].includes('%') ? 'percent' : (match[0].includes('$') ? 'currency' : 'number'));
    }
  };

  if (currency) collect(/\$\s?\d[\d.,]*/g);
  if (percent) collect(/\d[\d.,]*\s?%/g);
  if (numbers) collect(/\d[\d.,]*/g);

  for (const value of terms || []) {
    const term = String(value).trim();
    if (!term) continue;
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegExp(term)})(?![\\p{L}\\p{N}])`, 'iu');
    if (pattern.test(text)) add(term, 'word');
  }

  return [...found.values()];
}

module.exports = {
  DEFAULT_FINANCIAL_TERMS,
  DEFAULT_HIGHLIGHT_COLOR,
  escapeRegExp,
  detectKeywords
};
