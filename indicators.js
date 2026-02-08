/**
 * Technical Analysis Indicators
 */

/**
 * Calculate Simple Moving Average (SMA)
 * @param {number[]} values - Array of prices
 * @param {number} period - Period for SMA
 * @returns {number[]} Array of SMA values
 */
function sma(values, period) {
    if (!values || values.length < period) return new Array(values.length).fill(null);
    const out = [];
    for (let i = 0; i < values.length; i++) {
        if (i + 1 < period) { out.push(null); continue; }
        const slice = values.slice(i - period + 1, i + 1);
        const sum = slice.reduce((a, b) => a + b, 0);
        out.push(sum / period);
    }
    return out;
}

/**
 * Calculate Exponential Moving Average (EMA)
 * @param {number[]} values - Array of prices
 * @param {number} period - Period for EMA
 * @returns {number[]} Array of EMA values
 */
function ema(values, period) {
    if (!values || values.length < period) return new Array(values.length).fill(null);
    const out = [];
    const k = 2 / (period + 1);
    let emaValue = null;
    // Initialize with SMA
    const initialSlice = values.slice(0, period);
    emaValue = initialSlice.reduce((a, b) => a + b, 0) / period;

    for (let i = 0; i < values.length; i++) {
        if (i < period - 1) {
            out.push(null);
            continue;
        }
        if (i === period - 1) {
            out.push(emaValue);
            continue;
        }
        emaValue = values[i] * k + out[out.length - 1] * (1 - k);
        out.push(emaValue);
    }
    return out;
}

/**
 * Calculate Relative Strength Index (RSI)
 * @param {number[]} values - Array of prices
 * @param {number} period - Period for RSI (default 14)
 * @returns {number[]} Array of RSI values
 */
function rsi(values, period = 14) {
    if (!values || values.length <= period) return new Array(values.length).fill(null);
    const out = [];
    let avgGain = 0;
    let avgLoss = 0;

    // First calculation
    for (let i = 1; i <= period; i++) {
        const change = values[i] - values[i - 1];
        if (change > 0) avgGain += change;
        else avgLoss += Math.abs(change);
    }
    avgGain /= period;
    avgLoss /= period;

    // Fill initial nulls
    for (let k = 0; k < period; k++) out.push(null);

    const firstRS = avgLoss === 0 ? 100 : avgGain / avgLoss;
    out.push(100 - (100 / (1 + firstRS)));

    for (let i = period + 1; i < values.length; i++) {
        const change = values[i] - values[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? Math.abs(change) : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;

        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        out.push(100 - (100 / (1 + rs)));
    }
    return out;
}

/**
 * Calculate MACD
 * @param {number[]} values - Array of prices
 * @param {number} fast - Fast period (12)
 * @param {number} slow - Slow period (26)
 * @param {number} signal - Signal period (9)
 * @returns {Object} { macdLine, signalLine, histogram }
 */
function macd(values, fast = 12, slow = 26, signal = 9) {
    const emaFast = ema(values, fast);
    const emaSlow = ema(values, slow);

    const macdLine = values.map((v, i) => {
        if (emaFast[i] === null || emaSlow[i] === null) return null;
        return emaFast[i] - emaSlow[i];
    });

    // Calculate signal line (EMA of MACD line)
    // We need to filter nulls usually, but my EMA implementation expects full array matching index
    // A simple way is to pass the macdLine but handle nulls? 
    // Standard EMA treats initial period as null. 
    // Let's filter non-nulls for calculation then pad back? 
    // Simpler: Just allow EMA to skip nulls or treat as 0? No that breaks it.
    // Correct approach: Pass valid MACD values to EMA, then offset result.

    const validMacdIndices = macdLine.findIndex(v => v !== null);
    if (validMacdIndices === -1) {
        return { macdLine, signalLine: new Array(values.length).fill(null), histogram: new Array(values.length).fill(null) };
    }

    const validMacd = macdLine.slice(validMacdIndices);
    const validSignal = ema(validMacd, signal);

    // Pad the signal line with nulls at the start
    const signalLine = new Array(validMacdIndices).fill(null).concat(validSignal);

    const histogram = macdLine.map((m, i) => {
        if (m === null || signalLine[i] === null) return null;
        return m - signalLine[i];
    });

    return { macdLine, signalLine, histogram };
}

function last(arr) {
    if (!arr || arr.length === 0) return null;
    for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i] !== null && arr[i] !== undefined) return arr[i];
    }
    return null;
}

module.exports = { sma, ema, rsi, macd, last };
