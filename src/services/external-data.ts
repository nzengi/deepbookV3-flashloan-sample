import axios from 'axios';
import BigNumber from 'bignumber.js';
import { Logger } from '../utils/logger';
import { ExternalPrice, BotConfig } from '../types/index';

/**
 * External Data Service
 * 
 * Fetches price data from external exchanges like Binance, Coinbase, etc.
 * for cross-DEX arbitrage opportunities
 */
export class ExternalDataService {
  private config: BotConfig;
  private priceCache: Map<string, ExternalPrice> = new Map();
  private lastUpdate: Map<string, number> = new Map();
  private readonly CACHE_DURATION = 5000; // 5 seconds cache

  constructor(config: BotConfig) {
    this.config = config;
  }

  /**
   * Get price from external exchange
   */
  async getPrice(symbol: string): Promise<ExternalPrice | null> {
    // Check cache first
    const cached = this.getCachedPrice(symbol);
    if (cached) {
      return cached;
    }

    try {
      // Try Binance first (most liquid)
      let price = await this.getBinancePrice(symbol);
      
      if (!price) {
        // Fallback to other exchanges
        price = await this.getCoinbasePrice(symbol);
      }

      if (price) {
        this.cachePrice(symbol, price);
      }

      return price;
    } catch (error) {
      Logger.error('Failed to get external price', { symbol, error });
      return null;
    }
  }

  /**
   * Get price from Binance
   */
  private async getBinancePrice(symbol: string): Promise<ExternalPrice | null> {
    try {
      const binanceSymbol = this.convertToBinanceSymbol(symbol);
      if (!binanceSymbol) return null;

      // Get 24h ticker statistics
      const response = await axios.get(
        `https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`,
        { timeout: 5000 }
      );

      const data = response.data;
      
      return {
        symbol,
        price: new BigNumber(data.lastPrice),
        timestamp: Date.now(),
        source: 'binance',
        volume24h: new BigNumber(data.volume)
      };
    } catch (error) {
      Logger.external('Binance API error', { symbol, error });
      return null;
    }
  }

  /**
   * Get price from Coinbase
   */
  private async getCoinbasePrice(symbol: string): Promise<ExternalPrice | null> {
    try {
      const coinbaseSymbol = this.convertToCoinbaseSymbol(symbol);
      if (!coinbaseSymbol) return null;

      const response = await axios.get(
        `https://api.coinbase.com/v2/exchange-rates?currency=${coinbaseSymbol}`,
        { timeout: 5000 }
      );

      const data = response.data.data;
      const usdRate = data.rates.USD;
      
      if (!usdRate) return null;

      return {
        symbol,
        price: new BigNumber(usdRate),
        timestamp: Date.now(),
        source: 'coinbase',
        volume24h: new BigNumber(0) // Coinbase API doesn't provide volume in this endpoint
      };
    } catch (error) {
      Logger.external('Coinbase API error', { symbol, error });
      return null;
    }
  }

  /**
   * Convert symbol to Binance format
   */
  private convertToBinanceSymbol(symbol: string): string | null {
    const symbolMap: { [key: string]: string } = {
      'SUI/USDT': 'SUIUSDT',
      'ETH/USDT': 'ETHUSDT',
      'BTC/USDT': 'BTCUSDT',
      'SOL/USDT': 'SOLUSDT',
      'ADA/USDT': 'ADAUSDT',
      'DOT/USDT': 'DOTUSDT',
      'MATIC/USDT': 'MATICUSDT'
    };

    return symbolMap[symbol] || null;
  }

  /**
   * Convert symbol to Coinbase format
   */
  private convertToCoinbaseSymbol(symbol: string): string | null {
    const symbolMap: { [key: string]: string } = {
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

  /**
   * Get cached price if available and fresh
   */
  private getCachedPrice(symbol: string): ExternalPrice | null {
    const cached = this.priceCache.get(symbol);
    const lastUpdate = this.lastUpdate.get(symbol);

    if (cached && lastUpdate && (Date.now() - lastUpdate < this.CACHE_DURATION)) {
      return cached;
    }

    return null;
  }

  /**
   * Cache price data
   */
  private cachePrice(symbol: string, price: ExternalPrice): void {
    this.priceCache.set(symbol, price);
    this.lastUpdate.set(symbol, Date.now());
  }

  /**
   * Get multiple prices at once
   */
  async getPrices(symbols: string[]): Promise<Map<string, ExternalPrice>> {
    const prices = new Map<string, ExternalPrice>();
    
    const promises = symbols.map(async (symbol) => {
      const price = await this.getPrice(symbol);
      if (price) {
        prices.set(symbol, price);
      }
    });

    await Promise.all(promises);
    return prices;
  }

  /**
   * Get market data summary
   */
  async getMarketSummary(): Promise<{
    totalVolume: BigNumber;
    activeSymbols: number;
    lastUpdate: number;
  }> {
    const allPrices = Array.from(this.priceCache.values());
    const totalVolume = allPrices.reduce(
      (sum, price) => sum.plus(price.volume24h),
      new BigNumber(0)
    );

    const lastUpdate = Math.max(
      ...Array.from(this.lastUpdate.values())
    );

    return {
      totalVolume,
      activeSymbols: allPrices.length,
      lastUpdate: lastUpdate || 0
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.priceCache.clear();
    this.lastUpdate.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    cachedSymbols: number;
    oldestEntry: number;
    newestEntry: number;
  } {
    const timestamps = Array.from(this.lastUpdate.values());
    
    return {
      cachedSymbols: this.priceCache.size,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : 0,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : 0
    };
  }
}

export default ExternalDataService;