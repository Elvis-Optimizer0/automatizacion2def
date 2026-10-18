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

const ENGLISH_FINANCIAL_TERMS = [
  'debt',
  'debts',
  'interest',
  'salary',
  'salaries',
  'wage',
  'wages',
  'tax',
  'taxes',
  'saving',
  'savings',
  'inflation',
  'credit',
  'loan',
  'loans',
  'mortgage',
  'card',
  'bank',
  'money',
  'payment',
  'payments',
  'installment',
  'installments',
  'rent',
  'income',
  'incomes',
  'profit',
  'profits',
  'loss',
  'losses',
  'investment',
  'investments',
  'cash',
  'cost',
  'costs',
  'price',
  'prices',
  'discount',
  'offer'
];

const DEFAULT_HIGHLIGHT_COLOR = '#ff0000';
const DEFAULT_TOP_N = 30;
const MIN_TERM_LENGTH = 4;

const ENGLISH_STOPWORDS = [
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'cannot', 'could',
  'did', 'do', 'does', 'doing', 'down', 'during',
  'each',
  'few', 'for', 'from', 'further',
  'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself',
  'just',
  'me', 'more', 'most', 'my', 'myself',
  'no', 'nor', 'not', 'now',
  'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'she', 'should', 'so', 'some', 'such',
  'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this',
  'those', 'through', 'to', 'too',
  'under', 'until', 'up',
  'very',
  'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with', 'would',
  'you', 'your', 'yours', 'yourself', 'yourselves'
];

const SPANISH_STOPWORDS = [
  'a', 'al', 'algo', 'algun', 'alguna', 'algunas', 'alguno', 'algunos', 'alla', 'alli',
  'ante', 'antes', 'aquel', 'aquella', 'aquellas', 'aquello', 'aquellos', 'aqui', 'arriba', 'asi',
  'bajo', 'bien', 'bueno',
  'cada', 'casi', 'cierto', 'como', 'con', 'contra', 'cual', 'cuales', 'cuando', 'cuanto',
  'de', 'del', 'demasiado', 'desde', 'donde', 'dos', 'durante',
  'e', 'el', 'ella', 'ellas', 'ello', 'ellos', 'en', 'entonces', 'entre', 'era', 'eran', 'eres',
  'esa', 'esas', 'ese', 'eso', 'esos', 'esta', 'estaba', 'estaban', 'estado', 'estamos', 'estan',
  'estar', 'estas', 'este', 'esto', 'estos', 'estoy', 'excepto',
  'fin', 'fue', 'fueron', 'fui', 'fuimos',
  'ha', 'haber', 'habia', 'han', 'has', 'hasta', 'hay', 'haya', 'he', 'hemos', 'hola', 'hubo',
  'igual', 'incluso', 'intenta',
  'junto',
  'la', 'las', 'le', 'les', 'lo', 'los', 'luego', 'lugar',
  'mas', 'me', 'menos', 'mi', 'mientras', 'mis', 'mismo', 'mucho', 'muchos', 'muy',
  'nada', 'ni', 'ningun', 'ninguna', 'no', 'nos', 'nosotros', 'nuestra', 'nuestro', 'nuevo', 'nunca',
  'o', 'otra', 'otras', 'otro', 'otros',
  'para', 'parece', 'pero', 'poco', 'por', 'porque', 'pues',
  'que', 'quien', 'quienes', 'quiere', 'quizas',
  'se', 'sea', 'segun', 'ser', 'si', 'sin', 'sobre', 'sois', 'solamente', 'solo', 'somos', 'son', 'soy', 'su', 'sus',
  'tal', 'tambien', 'tan', 'tanto', 'te', 'tema', 'tener', 'tengo', 'ti', 'tiene', 'tienen',
  'toda', 'todas', 'todo', 'todos', 'tu', 'tus',
  'un', 'una', 'unas', 'uno', 'unos',
  'va', 'vais', 'vamos', 'van', 'varios', 'ver', 'vez',
  'y', 'ya', 'yo'
];

const STOPWORDS_BY_LANGUAGE = {
  es: SPANISH_STOPWORDS,
  en: ENGLISH_STOPWORDS
};

const FINANCIAL_TERMS_BY_LANGUAGE = {
  es: DEFAULT_FINANCIAL_TERMS,
  en: ENGLISH_FINANCIAL_TERMS
};

function normalizeLanguage(language) {
  const value = String(language == null ? '' : language).trim().toLowerCase();
  if (value === 'en' || value === 'eng' || value === 'english') return 'en';
  return 'es';
}

function getStopwords(language) {
  return STOPWORDS_BY_LANGUAGE[normalizeLanguage(language)] || SPANISH_STOPWORDS;
}

function getFinancialTerms(language) {
  return FINANCIAL_TERMS_BY_LANGUAGE[normalizeLanguage(language)] || DEFAULT_FINANCIAL_TERMS;
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeWord(text) {
  return String(text == null ? '' : text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function tokenizeRaw(text) {
  return String(text == null ? '' : text).match(/[\p{L}\p{N}]+/gu) || [];
}

function isStopword(token, language = 'es') {
  return getStopwords(language).includes(normalizeWord(token));
}

function isNumberToken(token) {
  return /^\d[\d.,]*$/.test(String(token));
}

function symbolPatterns(options) {
  const { numbers = true, percent = true, currency = true } = options;
  const patterns = [];
  if (currency) patterns.push({ regex: /(?:US\$|\$)\s?\d[\d.,]*/g, kind: 'currency', weight: 3 });
  if (percent) patterns.push({ regex: /\d[\d.,]*\s?%/g, kind: 'percent', weight: 3 });
  if (numbers) patterns.push({ regex: /\b\d[\d.,]*\b/g, kind: 'number', weight: 2 });
  return patterns;
}

function detectKeywords(texts, options = {}) {
  const language = normalizeLanguage(options.language);
  const {
    terms = getFinancialTerms(language),
    topN = DEFAULT_TOP_N,
    frequency = true
  } = options;
  const stopwords = getStopwords(language);

  const sceneTexts = (Array.isArray(texts) ? texts : [texts]).map(value => String(value == null ? '' : value));
  const results = new Map();

  const upsert = (key, term, kind, weight, scene) => {
    const cleanKey = String(key).trim();
    const cleanTerm = String(term).trim();
    if (!cleanKey || !cleanTerm) return null;
    let item = results.get(cleanKey);
    if (!item) {
      item = { term: cleanTerm, kind, count: 0, score: 0, scene };
      results.set(cleanKey, item);
    }
    item.count += 1;
    item.score += weight;
    if (item.scene == null) item.scene = scene;
    return item;
  };

  const patterns = symbolPatterns(options);
  sceneTexts.forEach((text, index) => {
    const sceneNumber = index + 1;
    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(text)) !== null) {
        const raw = match[0].trim();
        upsert(raw.toLowerCase(), raw, pattern.kind, pattern.weight, sceneNumber);
        if (match.index === pattern.regex.lastIndex) pattern.regex.lastIndex += 1;
      }
    }
  });

  for (const value of terms || []) {
    const term = String(value).trim();
    const normTerm = normalizeWord(term);
    if (!normTerm) continue;
    const parts = normTerm.split(' ').filter(Boolean);
    sceneTexts.forEach((text, index) => {
      const rawTokens = tokenizeRaw(text);
      const normTokens = rawTokens.map(normalizeWord);
      if (parts.length === 1) {
        for (let i = 0; i < normTokens.length; i++) {
          if (normTokens[i] === normTerm) upsert(normTerm, rawTokens[i], 'term', 5, index + 1);
        }
      } else {
        for (let i = 0; i + parts.length <= normTokens.length; i++) {
          let match = true;
          for (let j = 0; j < parts.length; j++) {
            if (normTokens[i + j] !== parts[j]) {
              match = false;
              break;
            }
          }
          if (match) upsert(normTerm, rawTokens.slice(i, i + parts.length).join(' '), 'term', 5, index + 1);
        }
      }
    });
  }

  if (frequency) {
    const unigrams = new Map();
    const ngrams = new Map();
    const bump = (store, key, display, sceneIndex, size) => {
      let entry = store.get(key);
      if (!entry) {
        entry = { display, count: 0, scenes: new Set(), size };
        store.set(key, entry);
      }
      entry.count += 1;
      entry.scenes.add(sceneIndex);
    };

    sceneTexts.forEach((text, sceneIndex) => {
      const rawTokens = tokenizeRaw(text);
      const normTokens = rawTokens.map(normalizeWord);
      for (let i = 0; i < rawTokens.length; i++) {
        const norm = normTokens[i];
        if (!norm || norm.length < MIN_TERM_LENGTH) continue;
        if (isNumberToken(rawTokens[i]) || stopwords.includes(norm)) continue;
        bump(unigrams, norm, rawTokens[i], sceneIndex, 1);
      }
      for (let size = 2; size <= 3; size += 1) {
        for (let i = 0; i + size <= rawTokens.length; i++) {
          const gramNorm = normTokens.slice(i, i + size);
          const gramRaw = rawTokens.slice(i, i + size);
          if (gramNorm.some((token, position) => !token || isNumberToken(gramRaw[position]))) continue;
          const content = gramNorm.filter(token => !stopwords.includes(token));
          if (content.length < 2) continue;
          if (stopwords.includes(gramNorm[0]) || stopwords.includes(gramNorm[gramNorm.length - 1])) continue;
          bump(ngrams, gramNorm.join(' '), gramRaw.join(' '), sceneIndex, size);
        }
      }
    });

    const addFrequency = (key, entry) => {
      if (entry.count < 2 || results.has(key)) return;
      const length = key.length;
      const sizeWeight = entry.size === 3 ? 1.6 : (entry.size === 2 ? 1.3 : 1);
      const score = entry.count * (1 + length * 0.08) * sizeWeight + entry.scenes.size * 0.5;
      results.set(key, {
        term: entry.display,
        kind: entry.size > 1 ? 'phrase' : 'word',
        count: entry.count,
        score,
        scene: Math.min(...entry.scenes) + 1
      });
    };

    for (const [key, entry] of unigrams) addFrequency(key, entry);
    for (const [key, entry] of ngrams) addFrequency(key, entry);
  }

  const list = [...results.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.count !== a.count) return b.count - a.count;
    if (b.term.length !== a.term.length) return b.term.length - a.term.length;
    return a.term.localeCompare(b.term);
  });

  return topN > 0 ? list.slice(0, topN) : list;
}

module.exports = {
  DEFAULT_FINANCIAL_TERMS,
  ENGLISH_FINANCIAL_TERMS,
  DEFAULT_HIGHLIGHT_COLOR,
  DEFAULT_TOP_N,
  MIN_TERM_LENGTH,
  SPANISH_STOPWORDS,
  ENGLISH_STOPWORDS,
  STOPWORDS_BY_LANGUAGE,
  FINANCIAL_TERMS_BY_LANGUAGE,
  normalizeLanguage,
  getStopwords,
  getFinancialTerms,
  escapeRegExp,
  normalizeWord,
  tokenizeRaw,
  isStopword,
  detectKeywords
};
