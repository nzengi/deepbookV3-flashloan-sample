"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExternalDataService = void 0;
const axios_1 = __importDefault(require("axios"));
const bignumber_js_1 = __importDefault(require("bignumber.js"));
const logger_1 = require("../utils/logger");
class ExternalDataService {
    constructor(config) {
        this.priceCache = new Map();
        this.lastUpdate = new Map();
        this.CACHE_DURATION = 5000;
        this.config = config;
    }
    async getPrice(symbol) {
        const cached = this.getCachedPrice(symbol);
        if (cached) {
            return cached;
        }
        try {
            let price = await this.getBinancePrice(symbol);
            if (!price) {
                price = await this.getCoinbasePrice(symbol);
            }
            if (price) {
                this.cachePrice(symbol, price);
            }
            return price;
        }
        catch (error) {
            logger_1.Logger.error('Failed to get external price', { symbol, error });
            return null;
        }
    }
    async getBinancePrice(symbol) {
        try {
            const binanceSymbol = this.convertToBinanceSymbol(symbol);
            if (!binanceSymbol)
                return null;
            const response = await axios_1.default.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`, { timeout: 5000 });
            const data = response.data;
            return {
                symbol,
                price: new bignumber_js_1.default(data.lastPrice),
                timestamp: Date.now(),
                source: 'binance',
                volume24h: new bignumber_js_1.default(data.volume)
            };
        }
        catch (error) {
            logger_1.Logger.external('Binance API error', { symbol, error });
            return null;
        }
    }
    async getCoinbasePrice(symbol) {
        try {
            const coinbaseSymbol = this.convertToCoinbaseSymbol(symbol);
            if (!coinbaseSymbol)
                return null;
            const response = await axios_1.default.get(`https://api.coinbase.com/v2/exchange-rates?currency=${coinbaseSymbol}`, { timeout: 5000 });
            const data = response.data.data;
            const usdRate = data.rates.USD;
            if (!usdRate)
                return null;
            return {
                symbol,
                price: new bignumber_js_1.default(usdRate),
                timestamp: Date.now(),
                source: 'coinbase',
                volume24h: new bignumber_js_1.default(0)
            };
        }
        catch (error) {
            logger_1.Logger.external('Coinbase API error', { symbol, error });
            return null;
        }
    }
    convertToBinanceSymbol(symbol) {
        const symbolMap = {
            'SUI/USDT': 'SUIUSDT',
            'SUIUSDT': 'SUIUSDT',
            'SUI/USDC': 'SUIUSDC',
            'SUIUSDC': 'SUIUSDC',
            'ETH/USDT': 'ETHUSDT',
            'BTC/USDT': 'BTCUSDT',
            'SOL/USDT': 'SOLUSDT',
            'ADA/USDT': 'ADAUSDT',
            'DOT/USDT': 'DOTUSDT',
            'MATIC/USDT': 'MATICUSDT'
        };
        return symbolMap[symbol] || null;
    }
    convertToCoinbaseSymbol(symbol) {
        const symbolMap = {
            'SUI/USDT': 'SUI',
            'ETH/USDT': 'ETH',
            'BTC/USDT': 'BTC',
            'SOL/USDT': 'SOL',
            'ADA/USDT': 'ADA',
            'DOT/USDT': 'DOT',
            'MATIC/USDT': 'MATIC'
        };
        return symbolMap[symbol] || null;
    }
    getCachedPrice(symbol) {
        const cached = this.priceCache.get(symbol);
        const lastUpdate = this.lastUpdate.get(symbol);
        if (cached && lastUpdate && (Date.now() - lastUpdate < this.CACHE_DURATION)) {
            return cached;
        }
        return null;
    }
    cachePrice(symbol, price) {
        this.priceCache.set(symbol, price);
        this.lastUpdate.set(symbol, Date.now());
    }
    async getPrices(symbols) {
        const prices = new Map();
        const promises = symbols.map(async (symbol) => {
            const price = await this.getPrice(symbol);
            if (price) {
                prices.set(symbol, price);
            }
        });
        await Promise.all(promises);
        return prices;
    }
    async getMarketSummary() {
        const allPrices = Array.from(this.priceCache.values());
        const totalVolume = allPrices.reduce((sum, price) => sum.plus(price.volume24h), new bignumber_js_1.default(0));
        const lastUpdate = Math.max(...Array.from(this.lastUpdate.values()));
        return {
            totalVolume,
            activeSymbols: allPrices.length,
            lastUpdate: lastUpdate || 0
        };
    }
    clearCache() {
        this.priceCache.clear();
        this.lastUpdate.clear();
    }
    getCacheStats() {
        const timestamps = Array.from(this.lastUpdate.values());
        return {
            cachedSymbols: this.priceCache.size,
            oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : 0,
            newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : 0
        };
    }
}
exports.ExternalDataService = ExternalDataService;
exports.default = ExternalDataService;
//# sourceMappingURL=external-data.js.map