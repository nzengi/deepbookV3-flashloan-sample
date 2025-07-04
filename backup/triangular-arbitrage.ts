import BigNumber from 'bignumber.js';
import { Logger } from '../utils/logger';
import { MathUtils } from '../utils/math';
import { 
  ArbitrageStrategy, 
  FlashLoanOpportunity, 
  FlashLoanResult,
  TradingPair,
  TriangularArbitrageParams
} from '../types/index';
import DeepBookService from '../services/deepbook';

/**
 * Triangular Arbitrage Strategy
 * 
 * This strategy identifies arbitrage opportunities across three trading pairs
 * that form a triangle (e.g., SUI -> USDC -> DEEP -> SUI)
 */
export class TriangularArbitrageStrategy implements ArbitrageStrategy {
  public readonly name = 'Triangular Arbitrage';
  public enabled = true;
  public minProfitThreshold: BigNumber;
  public maxSlippage: BigNumber;
  public priority = 1;
  public riskLevel: 'low' | 'medium' | 'high' = 'medium';

  private deepBookService: DeepBookService;
  private triangularPaths: TriangularPath[] = [];

  constructor(
    deepBookService: DeepBookService,
    minProfitThreshold: BigNumber,
    maxSlippage: BigNumber
  ) {
    this.deepBookService = deepBookService;
    this.minProfitThreshold = minProfitThreshold;
    this.maxSlippage = maxSlippage;
    this.initializeTriangularPaths();
  }

  /**
   * Initialize common triangular arbitrage paths
   */
  private initializeTriangularPaths(): void {
    // Define common triangular paths
    const commonPaths = [
      // SUI-based triangles
      ['SUI', 'USDC', 'DEEP'],
      ['SUI', 'USDC', 'WETH'],
      ['SUI', 'USDC', 'WBTC'],
      ['SUI', 'DEEP', 'USDC'],
      
      // USDC-based triangles
      ['USDC', 'WETH', 'SUI'],
      ['USDC', 'WBTC', 'SUI'],
      ['USDC', 'DEEP', 'SUI'],
      ['USDC', 'WUSDT', 'WUSDC'],
      
      // DEEP-based triangles
      ['DEEP', 'SUI', 'USDC'],
      ['DEEP', 'USDC', 'SUI'],
      
      // Cross-asset triangles
      ['WETH', 'USDC', 'SUI'],
      ['WBTC', 'USDC', 'SUI'],
      ['NS', 'SUI', 'USDC'],
      ['TYPUS', 'SUI', 'USDC']
    ];

    for (const path of commonPaths) {
      const pairs = this.buildTradingPairsFromPath(path);
      if (pairs.length === 3) {
        this.triangularPaths.push({
          assets: path,
          pairs,
          priority: this.calculatePathPriority(pairs)
        });
      }
    }

    // Sort paths by priority (higher priority first)
    this.triangularPaths.sort((a, b) => b.priority - a.priority);
    
    Logger.info(`Initialized ${this.triangularPaths.length} triangular arbitrage paths`);
  }

  /**
   * Build trading pairs from asset path
   */
  private buildTradingPairsFromPath(assetPath: string[]): TradingPair[] {
    const pairs: TradingPair[] = [];
    
    for (let i = 0; i < assetPath.length; i++) {
      const baseAsset = assetPath[i];
      const quoteAsset = assetPath[(i + 1) % assetPath.length];
      
      // Try to find the trading pair (check both directions)
      let pair = this.findTradingPair(baseAsset, quoteAsset);
      if (!pair) {
        pair = this.findTradingPair(quoteAsset, baseAsset);
      }
      
      if (pair) {
        pairs.push(pair);
      } else {
        // If any pair is missing, this path is not viable
        return [];
      }
    }
    
    return pairs;
  }

  /**
   * Find trading pair by symbols
   */
  private findTradingPair(base: string, quote: string): TradingPair | null {
    const pairs = this.deepBookService.getAllTradingPairs();
    return pairs.find(pair => 
      (pair.base === base && pair.quote === quote) ||
      (pair.base === quote && pair.quote === base)
    ) || null;
  }

  /**
   * Calculate priority for a triangular path based on liquidity and volume
   */
  private calculatePathPriority(pairs: TradingPair[]): number {
    let priority = 0;
    
    for (const pair of pairs) {
      const price = this.deepBookService.getPrice(pair.symbol);
      if (price) {
        // Higher volume = higher priority
        priority += price.volume24h.toNumber();
      }
    }
    
    return priority;
  }

  /**
   * Scan for triangular arbitrage opportunities
   */
  async scanOpportunities(): Promise<FlashLoanOpportunity[]> {
    const opportunities: FlashLoanOpportunity[] = [];
    
    for (const path of this.triangularPaths) {
      try {
        const opportunity = await this.analyzeTriangularPath(path);
        if (opportunity) {
          opportunities.push(opportunity);
        }
      } catch (error) {
        Logger.error(`Error analyzing triangular path ${path.assets.join(' -> ')}`, { error });
      }
    }
    
    // Sort by profit percentage (highest first)
    opportunities.sort((a, b) => {
      const result = b.profitPercentage.comparedTo(a.profitPercentage);
      return result === null ? 0 : result;
    });
    
    return opportunities;
  }

  /**
   * Analyze a specific triangular path for arbitrage opportunities
   */
  private async analyzeTriangularPath(path: TriangularPath): Promise<FlashLoanOpportunity | null> {
    const { pairs, assets } = path;
    
    if (pairs.length !== 3) {
      return null;
    }

    // Get current prices for all pairs
    const prices = pairs.map(pair => this.deepBookService.getPrice(pair.symbol));
    if (prices.some(price => !price)) {
      return null; // Missing price data
    }

    // Calculate the theoretical arbitrage profit
    const startAmount = new BigNumber(1000000000); // 1 SUI equivalent for calculation
    const result = this.calculateTriangularArbitrage(pairs, prices as any[], startAmount);
    
    if (!result || result.profitPercentage.isLessThan(this.minProfitThreshold)) {
      return null;
    }

    // Find optimal trade amount
    const optimalResult = this.findOptimalTradeAmount(pairs, prices as any[]);
    
    if (!optimalResult || optimalResult.profit.isLessThanOrEqualTo(0)) {
      return null;
    }

    // Estimate gas cost
    const gasEstimate = this.estimateGasCost(pairs.length);
    
    // Check if profit is still viable after gas costs
    if (!MathUtils.isProfitableAfterGas(
      optimalResult.profit,
      gasEstimate,
      this.minProfitThreshold.multipliedBy(optimalResult.amount)
    )) {
      return null;
    }

    const opportunity: FlashLoanOpportunity = {
      id: this.generateOpportunityId(path),
      type: 'triangular',
      pools: pairs,
      path: assets,
      expectedProfit: optimalResult.profit,
      profitPercentage: result.profitPercentage,
      tradeAmount: optimalResult.amount,
      gasEstimate,
      confidence: this.calculateConfidence(pairs, result.profitPercentage),
      timestamp: Date.now()
    };

    Logger.arbitrage('Triangular arbitrage opportunity found', {
      path: assets.join(' -> '),
      profitPercentage: result.profitPercentage.toString(),
      expectedProfit: optimalResult.profit.toString(),
      tradeAmount: optimalResult.amount.toString()
    });

    return opportunity;
  }

  /**
   * Calculate triangular arbitrage profit
   */
  private calculateTriangularArbitrage(
    pairs: TradingPair[],
    prices: any[],
    startAmount: BigNumber
  ): { profit: BigNumber; profitPercentage: BigNumber; endAmount: BigNumber } | null {
    try {
      let currentAmount = startAmount;
      
      // Execute the triangular trade simulation
      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        const price = prices[i];
        
        if (!price) return null;
        
        // Simulate the trade with slippage and fees
        const slippage = this.calculateSlippage(currentAmount, pair);
        const fee = this.calculateTradingFee(currentAmount);
        
        // Apply price, slippage, and fees
        currentAmount = currentAmount
          .multipliedBy(price.price)
          .multipliedBy(new BigNumber(1).minus(slippage))
          .multipliedBy(new BigNumber(1).minus(fee));
      }
      
      const profit = currentAmount.minus(startAmount);
      const profitPercentage = profit.dividedBy(startAmount);
      
      return { profit, profitPercentage, endAmount: currentAmount };
    } catch (error) {
      Logger.error('Error calculating triangular arbitrage', { error });
      return null;
    }
  }

  /**
   * Find optimal trade amount for maximum profit
   */
  private findOptimalTradeAmount(
    pairs: TradingPair[],
    prices: any[]
  ): { amount: BigNumber; profit: BigNumber } | null {
    const minAmount = new BigNumber(100000000); // 0.1 SUI
    const maxAmount = new BigNumber(100000000000); // 100 SUI
    
    const profitFunction = (amount: BigNumber): BigNumber => {
      const result = this.calculateTriangularArbitrage(pairs, prices, amount);
      return result ? result.profit : new BigNumber(0);
    };
    
    return MathUtils.findOptimalTradeAmount(minAmount, maxAmount, profitFunction);
  }

  /**
   * Calculate slippage based on trade size and liquidity
   */
  private calculateSlippage(tradeAmount: BigNumber, pair: TradingPair): BigNumber {
    // Simple slippage model - in practice this would use order book depth
    const baseSlippage = new BigNumber(0.001); // 0.1% base slippage
    const liquidityFactor = tradeAmount.dividedBy(new BigNumber(1000000000000)); // Relative to 1000 SUI
    
    return baseSlippage.multipliedBy(new BigNumber(1).plus(liquidityFactor));
  }

  /**
   * Calculate trading fee
   */
  private calculateTradingFee(amount: BigNumber): BigNumber {
    // DeepBook fee structure - lower fees for DEEP token holders
    return new BigNumber(0.0025); // 0.25% for regular users
  }

  /**
   * Estimate gas cost for triangular arbitrage
   */
  private estimateGasCost(numberOfPairs: number): BigNumber {
    const baseGas = new BigNumber(50000000); // 0.05 SUI base
    const perPairGas = new BigNumber(20000000); // 0.02 SUI per pair
    
    return baseGas.plus(perPairGas.multipliedBy(numberOfPairs));
  }

  /**
   * Calculate confidence score for opportunity
   */
  private calculateConfidence(pairs: TradingPair[], profitPercentage: BigNumber): number {
    let confidence = 0.5; // Base confidence
    
    // Higher profit = higher confidence (but diminishing returns)
    const profitBonus = Math.min(profitPercentage.toNumber() * 10, 0.3);
    confidence += profitBonus;
    
    // More liquid pairs = higher confidence
    const liquidityBonus = pairs.length >= 3 ? 0.1 : 0;
    confidence += liquidityBonus;
    
    // Cap at 0.95
    return Math.min(confidence, 0.95);
  }

  /**
   * Generate unique opportunity ID
   */
  private generateOpportunityId(path: TriangularPath): string {
    const pathStr = path.assets.join('-');
    const timestamp = Date.now();
    return `triangular-${pathStr}-${timestamp}`;
  }

  /**
   * Execute triangular arbitrage opportunity
   */
  async execute(opportunity: FlashLoanOpportunity): Promise<FlashLoanResult> {
    Logger.arbitrage('Executing triangular arbitrage', {
      opportunityId: opportunity.id,
      path: opportunity.path.join(' -> '),
      expectedProfit: opportunity.expectedProfit.toString()
    });

    try {
      return await this.deepBookService.executeFlashLoanArbitrage(opportunity);
    } catch (error) {
      Logger.error('Triangular arbitrage execution failed', {
        opportunityId: opportunity.id,
        error
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: 0
      };
    }
  }
}

interface TriangularPath {
  assets: string[];
  pairs: TradingPair[];
  priority: number;
}

export default TriangularArbitrageStrategy;