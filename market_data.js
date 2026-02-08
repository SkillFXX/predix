const axios = require('axios');
const { sma, ema, rsi, macd, last } = require('./indicators');

// Yahoo Finance API v8
const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

async function loadExchangeInfo() {
    return true;
}

function normalizeSymbol(input) {
    if (!input) return null;
    let s = input.toUpperCase().trim();

    // Handled suffixes/prefixes for common needs
    // Crypto: BTC -> BTC-USD
    if (s.endsWith('USDT')) s = s.replace('USDT', '-USD');
    if (!s.includes('-') && !s.includes('.')) {
        const commonCrypto = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOT', 'DOGE', 'SHIB', 'LTC'];
        if (commonCrypto.includes(s)) s = s + '-USD';
    }

    return s;
}

async function checkSymbolExists(input) {
    const sym = normalizeSymbol(input);
    try {
        // Light request to check existence (1 day range)
        // We strictly check if there is data.
        const res = await axios.get(`${BASE}/${sym}?interval=1d&range=5d`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const result = res.data.chart?.result?.[0];
        if (!result) return false;

        // Yahoo returns a result object even for some invalid symbols but with empty timestamps
        if (!result.timestamp || result.timestamp.length === 0) return false;

        // Also check if we have actual quotes
        const quote = result.indicators?.quote?.[0];
        if (!quote || !quote.close || quote.close.length === 0) return false;

        // Check if all closes are null (can happen for some indices or delisted assets)
        const hasValidPrice = quote.close.some(c => c !== null);
        if (!hasValidPrice) return false;

        return true;
    } catch (err) {
        if (err.response && err.response.status === 404) return false;
        console.error(`Check symbol ${sym} error:`, err.message);
        return false;
    }
}

async function fetchCandles(symbol, interval = '1d', limit = 500) {
    const sym = normalizeSymbol(symbol);
    if (!sym) return null;

    const intervalMap = {
        '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '1h', '1d': '1d', '1w': '1wk'
    };
    const yInterval = intervalMap[interval] || '1d';

    // Calculate range based on limit. Yahoo accepts 'range' like 1y, 5y, 1mo.
    // 500 days ~ 2 years to be safe for weekends/holidays gaps in stocks
    let range = '2y';
    if (limit > 600) range = '5y';
    if (interval.includes('m') || (interval.includes('h') && !interval.includes('1mo'))) range = '1mo';

    try {
        const url = `${BASE}/${sym}?interval=${yInterval}&range=${range}`;
        const res = await axios.get(url, {
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const result = res.data.chart?.result?.[0];
        if (!result || !result.timestamp) {
            console.warn(`No data found for symbol: ${sym}`);
            return null;
        }

        const timestamps = result.timestamp;
        const quotes = result.indicators.quote[0];
        const adjClose = result.indicators.adjclose ? result.indicators.adjclose[0].adjclose : quotes.close;

        if (!quotes.open || !quotes.close) return null;

        const candles = timestamps.map((t, i) => ({
            openTime: t * 1000,
            open: quotes.open[i],
            high: quotes.high[i],
            low: quotes.low[i],
            close: adjClose[i] || quotes.close[i],
            volume: quotes.volume[i]
        })).filter(c => c.close !== null && c.open !== null); // Filter out empty trading days

        return candles.slice(-limit);
    } catch (err) {
        console.error(`Error fetching Yahoo data (${sym}):`, err.response?.data?.chart?.error?.description || err.message);
        return null;
    }
}

async function analyze(symbol) {
    const candles = await fetchCandles(symbol, '1d', 300);
    if (!candles || candles.length < 50) return null;

    const closes = candles.map(c => c.close);
    const currentPrice = closes[closes.length - 1];

    const ma20 = last(sma(closes, 20));
    const ma50 = last(sma(closes, 50));
    const ema12 = last(ema(closes, 12));
    const ema26 = last(ema(closes, 26));
    const rsi14 = last(rsi(closes, 14));
    const mac = macd(closes, 12, 26, 9);
    const histLast = last(mac.histogram);

    let score = 50;
    if (ma20 && ma50) score += (ma20 > ma50 ? 10 : -10);
    if (ma50) score += (currentPrice > ma50 ? 5 : -5);
    if (ema12 && ema26) score += (ema12 > ema26 ? 10 : -10);
    if (histLast !== null) score += (histLast > 0 ? 10 : -10);
    if (rsi14 !== null) {
        if (rsi14 < 30) score += 15;
        else if (rsi14 > 70) score -= 15;
    }

    score = Math.max(0, Math.min(100, score));
    let signal = 'NEUTRAL';
    if (score >= 65) signal = 'BUY';
    else if (score <= 35) signal = 'SELL';

    return {
        symbol: normalizeSymbol(symbol),
        currentPrice: Math.round(currentPrice * 100) / 100,
        indicators: {
            rsi14: Math.round(rsi14 || 0),
            score,
            ma20: ma20 ? ma20.toFixed(2) : null,
            ma50: ma50 ? ma50.toFixed(2) : null,
            ema12: ema12 ? ema12.toFixed(2) : null,
            ema26: ema26 ? ema26.toFixed(2) : null,
            macdHist: histLast ? histLast.toFixed(4) : null
        },
        signal,
        score, // Top level access for convenience
        meta: { timestamp: new Date().toISOString() }
    };
}

async function fetchNews(symbol, count = 5) {
    const sym = normalizeSymbol(symbol);
    try {
        const url = `https://finance.yahoo.com/rss/headline?s=${sym}`;
        const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });

        const xml = res.data;
        const items = [];
        const regex = /<item>[\s\S]*?<\/item>/g;
        const matches = xml.match(regex);

        if (matches) {
            matches.slice(0, count).forEach(item => {
                const titleMatch = item.match(/<title>(.*?)<\/title>/);
                const linkMatch = item.match(/<link>(.*?)<\/link>/);
                const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
                const descMatch = item.match(/<description>(.*?)<\/description>/);

                if (titleMatch) {
                    items.push({
                        title: titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/, '$1'),
                        link: linkMatch ? linkMatch[1] : '',
                        pubDate: pubDateMatch ? new Date(pubDateMatch[1]).toISOString() : new Date().toISOString(),
                        description: descMatch ? descMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/, '$1').replace(/<[^>]*>/g, '') : ''
                    });
                }
            });
        }
        return items;
    } catch (err) {
        console.error(`News fetch error for ${sym}:`, err.message);
        return [];
    }
}

module.exports = { loadExchangeInfo, checkSymbolExists, fetchCandles, analyze, fetchNews };
