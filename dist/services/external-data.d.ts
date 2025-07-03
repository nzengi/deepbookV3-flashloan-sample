import BigNumber from 'bignumber.js';
import { ExternalPrice, BotConfig } from '../types/index';
export declare class ExternalDataService {
    private config;
    private priceCache;
    private lastUpdate;
    private readonly CACHE_DURATION;
    constructor(config: BotConfig);
    getPrice(symbol: string): Promise<ExternalPrice | null>;
    private getBinancePrice;
    private getCoinbasePrice;
    private convertToBinanceSymbol;
    private convertToCoinbaseSymbol;
    private getCachedPrice;
    private cachePrice;
    getPrices(symbols: string[]): Promise<Map<string, ExternalPrice>>;
    getMarketSummary(): Promise<{
        totalVolume: BigNumber;
        activeSymbols: number;
        lastUpdate: number;
    }>;
    clearCache(): void;
    getCacheStats(): {
        cachedSymbols: number;
        oldestEntry: number;
        newestEntry: number;
    };
}
export default ExternalDataService;
//# sourceMappingURL=external-data.d.ts.map