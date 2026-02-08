const axios = require('axios');

class AiService {
    constructor() {
    }

    async analyzeNews(symbol, articles, model, daysLimit) {
        if (!articles || articles.length === 0) return { score: 50, explanation: "No news found." };

        const prompt = `
        You are a financial analyst. Analyze these news headlines for ${symbol} from the last ${daysLimit} days.
        
        News:
        ${articles.map(a => `- ${a.title} (${a.pubDate})`).join('\n')}

        Task:
        1. Assign a confidence score between 0 (Very Bearish) and 100 (Very Bullish) based on the sentiment. 50 is neutral.
        2. Provide a short explanation (max 2 sentences) justifying the score.

        Return ONLY a JSON object in this format:
        { "score": number, "explanation": "string" }
        `;

        return this.queryOllama(model, prompt);
    }

    async analyzeTechnical(symbol, indicators, model) {
        const prompt = `
        You are a technical analyst. Analyze these indicators for ${symbol}:
        - RSI: ${indicators.rsi14}
        - MACD Histogram: ${indicators.macdHist}
        - MA20: ${indicators.ma20}
        - MA50: ${indicators.ma50}
        - EMA12: ${indicators.ema12}
        - EMA26: ${indicators.ema26}
        - Current Price: ${indicators.currentPrice || 'N/A'}

        Task:
        1. Assign a confidence score between 0 (Strong Sell) and 100 (Strong Buy) based ONLY on these technicals.
        2. Provide a short explanation (max 2 sentences).

        Return ONLY a JSON object in this format:
        { "score": number, "explanation": "string" }
        `;

        return this.queryOllama(model, prompt);
    }

    async queryOllama(model, prompt) {
        // Get API URL from settings if possible, but for now we rely on param or default
        // In main.js we will pass the full URL or just use default in axios
        // Let's assume the caller passes the full baseUrl or we default to localhost
        const baseUrl = 'http://127.0.0.1:11434';

        try {
            const response = await axios.post(`${baseUrl}/api/generate`, {
                model: model,
                prompt: prompt,
                stream: false,
                format: "json"
            }, { timeout: 30000 });

            if (response.data && response.data.response) {
                try {
                    return JSON.parse(response.data.response);
                } catch (e) {
                    console.error("Failed to parse AI response:", response.data.response);
                    return { score: 50, explanation: "Error parsing AI response." };
                }
            }
            return { score: 50, explanation: "No response from AI." };
        } catch (err) {
            console.error("AI Service Error:", err.message);
            return { score: 50, explanation: "AI Service unavailable (" + err.message + ")" };
        }
    }
}

module.exports = new AiService();
