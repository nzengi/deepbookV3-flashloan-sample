import axios from 'axios';
import BigNumber from 'bignumber.js';
import { Logger } from '../utils/logger';
import { BotConfig } from '../types/index';

export interface BluefinPool {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  price: BigNumber;
  volume24h: BigNumber;
  lastUpdate: number;
}

export interface BluefinSwapResult {
  success: boolean;
  amountOut: BigNumber;
  priceImpact: BigNumber;
  fee: BigNumber;
  txHash?: string;
  error?: string;
}

export interface BluefinMarket {
  symbol: string;
  lastPrice: number;
  bidPrice: number;
  askPrice: number;
  volume24h: number;
  priceChange24h: number;
}

/**
 * BlueFin DEX Service
 * 
 * Handles price data and trading simulation for BlueFin protocol
 */
export class BluefinDexService {
  private config: BotConfig;
  private pools: Map<string, BluefinPool> = new Map();
  private readonly API_BASE = 'https://dapi.bluefin.io';
  private readonly SWAP_BASE = 'https://trade.bluefin.io';

  constructor(config: BotConfig) {
    this.config = config;
    Logger.info('BlueFin DEX service initialized');
  }

  /**
   * Initialize BlueFin markets and fetch current data
   */
  async initialize(): Promise<void> {
    try {
      // Fetch markets data from BlueFin API
      const markets = await this.fetchMarkets();
      
      // Convert to our pool format
      for (const market of markets) {
        const pool: BluefinPool = {
          symbol: market.symbol,
          baseAsset: this.extractBaseAsset(market.symbol),
          quoteAsset: this.extractQuoteAsset(market.symbol),
          price: new BigNumber(market.lastPrice),
          volume24h: new BigNumber(market.volume24h),
          lastUpdate: Date.now()
        };

        this.pools.set(pool.symbol, pool);
      }

      Logger.info(`Loaded ${this.pools.size} BlueFin markets`, { 
        pools: Array.from(this.pools.keys()) 
      });
    } catch (error) {
      Logger.error('Failed to initialize BlueFin markets', { error });
    }
  }

  /**
   * Get current price for a trading pair from BlueFin
   */
  async getPrice(symbol: string): Promise<BigNumber | null> {
    try {
      // Try to get from cache first
      const pool = this.pools.get(symbol);
      if (pool && (Date.now() - pool.lastUpdate) < 30000) { // 30 second cache
        return pool.price;
      }

      // Fetch fresh price from BlueFin API
      const market = await this.fetchMarketData(symbol);
      if (market) {
        const price = new BigNumber(market.lastPrice);
        
        // Update cache
        if (pool) {
          pool.price = price;
          pool.lastUpdate = Date.now();
          this.pools.set(symbol, pool);
        }
        
        return price;
      }

      return pool?.price || null;
    } catch (error) {
      Logger.error(`Failed to get BlueFin price for ${symbol}`, { error });
      return null;
    }
  }

  /**
   * Get bid/ask spread for better arbitrage calculations
   */
  async getBidAsk(symbol: string): Promise<{ bid: BigNumber; ask: BigNumber } | null> {
    try {
      const market = await this.fetchMarketData(symbol);
      if (market && market.bidPrice && market.askPrice) {
        return {
          bid: new BigNumber(market.bidPrice),
          ask: new BigNumber(market.askPrice)
        };
      }
      return null;
    } catch (error) {
      Logger.error(`Failed to get BlueFin bid/ask for ${symbol}`, { error });
      return null;
    }
  }

  /**
   * Simulate swap execution on BlueFin (for arbitrage calculation)
   */
  async simulateSwap(
    symbol: string,
    amountIn: BigNumber,
    sellingSide: boolean // true if selling base asset
  ): Promise<BluefinSwapResult> {
    try {
      const bidAsk = await this.getBidAsk(symbol);
      if (!bidAsk) {
        return {
          success: false,
          amountOut: new BigNumber(0),
          priceImpact: new BigNumber(0),
          fee: new BigNumber(0),
          error: `No bid/ask data for ${symbol}`
        };
      }

      // Use bid price when selling, ask price when buying
      const executionPrice = sellingSide ? bidAsk.bid : bidAsk.ask;
      
      // Calculate amount out (simplified simulation)
      const amountOut = sellingSide 
        ? amountIn.multipliedBy(executionPrice) // Selling base for quote
        : amountIn.dividedBy(executionPrice);   // Buying base with quote

      // BlueFin fees (simplified - typically 0.05% taker fee)
      const feeRate = new BigNumber(0.0005); // 0.05%
      const fee = amountOut.multipliedBy(feeRate);
      const finalAmountOut = amountOut.minus(fee);

      // Price impact simulation (simplified)
      const priceImpact = amountIn.dividedBy(new BigNumber(100000)); // 0.001% per $1000

      Logger.external(`BlueFin swap simulation: ${symbol}`, {
        amountIn: amountIn.toString(),
        amountOut: finalAmountOut.toString(),
        executionPrice: executionPrice.toString(),
        sellingSide
      });

      return {
        success: true,
        amountOut: finalAmountOut,
        priceImpact,
        fee
      };

    } catch (error) {
      Logger.error(`BlueFin swap simulation failed for ${symbol}`, { error });
      return {
        success: false,
        amountOut: new BigNumber(0),
        priceImpact: new BigNumber(0),
        fee: new BigNumber(0),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get all available pools
   */
  getAllPools(): BluefinPool[] {
    return Array.from(this.pools.values());
  }

  /**
   * Get pool information
   */
  getPool(symbol: string): BluefinPool | null {
    return this.pools.get(symbol) || null;
  }

  /**
   * Fetch markets from BlueFin API
   */
  private async fetchMarkets(): Promise<BluefinMarket[]> {
    try {
      // BlueFin uses different API structure - focusing on key pairs
      const majorPairs = [
        'SUI-PERP', 'SUI-USD', 'BTC-USD', 'ETH-USD', 'SOL-USD'
      ];

      const markets: BluefinMarket[] = [];
      
      // Simulate market data for major pairs (in production, use actual API)
      for (const symbol of majorPairs) {
        if (symbol.startsWith('SUI')) {
          markets.push({
            symbol: 'SUI/USDC', // Normalize to standard format
            lastPrice: 4.25, // Current SUI price range
            bidPrice: 4.24,
            askPrice: 4.26,
            volume24h: 1500000, // $1.5M daily volume
            priceChange24h: 0.025 // 2.5% change
          });
        }
      }

      return markets;
    } catch (error) {
      Logger.error('Failed to fetch BlueFin markets', { error });
      return [];
    }
  }

  /**
   * Fetch specific market data
   */
  private async fetchMarketData(symbol: string): Promise<BluefinMarket | null> {
    try {
      // For SUI/USDC, return simulated data (in production, use actual BlueFin API)
      if (symbol === 'SUI/USDC' || symbol === 'SUI_USDC') {
        return {
          symbol: 'SUI/USDC',
          lastPrice: 4.25 + (Math.random() - 0.5) * 0.1, // Small random variation
          bidPrice: 4.24,
          askPrice: 4.26,
          volume24h: 1500000,
          priceChange24h: 0.025
        };
      }

      return null;
    } catch (error) {
      Logger.error(`Failed to fetch BlueFin market data for ${symbol}`, { error });
      return null;
    }
  }

  /**
   * Helper: Extract base asset from symbol
   */
  private extractBaseAsset(symbol: string): string {
    return symbol.split('/')[0] || symbol.split('-')[0] || 'UNKNOWN';
  }

  /**
   * Helper: Extract quote asset from symbol
   */
  private extractQuoteAsset(symbol: string): string {
    const parts = symbol.split('/');
    if (parts.length > 1) return parts[1];
    
    const dashParts = symbol.split('-');
    if (dashParts.length > 1) return dashParts[1];
    
    return 'USD'; // Default to USD for BlueFin
  }

  /**
   * Get market statistics
   */
  getMarketStats(): {
    totalPools: number;
    totalVolume24h: BigNumber;
    lastUpdate: number;
  } {
    const pools = Array.from(this.pools.values());
    const totalVolume24h = pools.reduce(
      (sum, pool) => sum.plus(pool.volume24h),
      new BigNumber(0)
    );

    return {
      totalPools: pools.length,
      totalVolume24h,
      lastUpdate: Math.max(...pools.map(p => p.lastUpdate))
    };
  }
}

export default BluefinDexService;