import BigNumber from "bignumber.js";
import { Logger } from "../utils/logger";
import { MathUtils } from "../utils/math";
import {
  ArbitrageStrategy,
  FlashLoanOpportunity,
  FlashLoanResult,
  TradingPair,
  CrossDexArbitrageParams,
  ExternalPrice,
} from "../types/index";
import DeepBookService from "../services/deepbook";
import ExternalDataService from "../services/external-data";

/**
 * Cross-DEX Arbitrage Strategy
 *
 * This strategy identifies price discrepancies between DeepBook and external exchanges
 * (like Binance, Coinbase, etc.) and executes arbitrage trades
 */
export class CrossDexArbitrageStrategy implements ArbitrageStrategy {
  public readonly name = "Cross-DEX Arbitrage";
  public enabled = true;
  public minProfitThreshold: BigNumber;
  public maxSlippage: BigNumber;
  public priority = 2;
  public riskLevel: "low" | "medium" | "high" = "low";

  private deepBookService: DeepBookService;
  private externalDataService: ExternalDataService;
  private monitoredPairs: MonitoredPair[] = [];

  constructor(
    deepBookService: DeepBookService,
    externalDataService: ExternalDataService,
    minProfitThreshold: BigNumber,
    maxSlippage: BigNumber
  ) {
    this.deepBookService = deepBookService;
    this.externalDataService = externalDataService;
    this.minProfitThreshold = minProfitThreshold;
    this.maxSlippage = maxSlippage;
    this.initializeMonitoredPairs();
  }

  /**
   * Initialize pairs to monitor for cross-DEX arbitrage
   */
  private initializeMonitoredPairs(): void {
    // Focus on high-volume arbitrage opportunities with real profit potential
    const pairMappings = [
      {
        deepbookSymbol: "SUI_USDC",
        externalSymbol: "SUIUSDT", // Binance high-volume pair
        baseAsset: "SUI",
        quoteAsset: "USDC",
        conversionRequired: true, // USDT -> USDC conversion (~1.000 ratio)
        priority: 1, // Highest priority for proven arbitrage
      },
      {
        deepbookSymbol: "SUI_USDC", 
        externalSymbol: "SUIUSDC", // Coinbase direct pair if available
        baseAsset: "SUI",
        quoteAsset: "USDC",
        conversionRequired: false,
        priority: 2,
      }
    ];

    this.monitoredPairs = pairMappings
      .filter((mapping) => mapping.externalSymbol !== null)
      .map((mapping) => ({
        deepbookPair: this.deepBookService.getTradingPair(
          mapping.deepbookSymbol
        ),
        externalSymbol: mapping.externalSymbol!,
        baseAsset: mapping.baseAsset,
        quoteAsset: mapping.quoteAsset,
        conversionRequired: mapping.conversionRequired,
        priority: mapping.priority,
        lastPriceCheck: 0,
        priceDiscrepancy: new BigNumber(0),
      }))
      .filter((pair) => pair.deepbookPair !== null) as MonitoredPair[];

    Logger.info(`Initialized ${this.monitoredPairs.length} SUI/USDC cross-DEX arbitrage pairs for profitable trading`);
  }

  /**
   * Scan for cross-DEX arbitrage opportunities
   */
  async scanOpportunities(): Promise<FlashLoanOpportunity[]> {
    const opportunities: FlashLoanOpportunity[] = [];
    for (const monitoredPair of this.monitoredPairs) {
      try {
        const opportunity = await this.analyzeCrossDexPair(monitoredPair);
        if (opportunity) {
          // Only accept if expected profit > 0.10 USDC
          if (
            opportunity.expectedProfit &&
            opportunity.expectedProfit.isGreaterThanOrEqualTo(0.05) // Lower threshold for v3.1 ultra-low fees
          ) {
            opportunities.push(opportunity);
            Logger.arbitrage(`Profitable SUI/USDC opportunity: ${opportunity.expectedProfit.toFixed(4)} USDC profit`, {
              strategy: 'cross-dex',
              pair: monitoredPair.baseAsset + '/' + monitoredPair.quoteAsset,
              type: opportunity.type
            });
          } else if (opportunity.expectedProfit && opportunity.expectedProfit.isGreaterThan(0)) {
            Logger.info(
              `Small opportunity found but profit (${opportunity.expectedProfit.toFixed(
                4
              )}) < 0.05 USDC minimum, monitoring for better conditions.`
            );
          }
        }
      } catch (error) {
        Logger.error(`Error analyzing SUI/USDC cross-DEX pair`, { error });
      }
    }
    // Sort by profit (highest first)
    opportunities.sort((a, b) =>
      b.expectedProfit.minus(a.expectedProfit).toNumber()
    );
    return opportunities;
  }

  /**
   * Analyze a specific pair for cross-DEX arbitrage opportunities
   */
  private async analyzeCrossDexPair(
    monitoredPair: MonitoredPair
  ): Promise<FlashLoanOpportunity | null> {
    if (!monitoredPair.deepbookPair) return null;

    // Get current prices from both sources
    const deepbookPrice = this.deepBookService.getPrice(
      monitoredPair.deepbookPair.symbol
    );
    const externalPrice = await this.externalDataService.getPrice(
      monitoredPair.externalSymbol
    );

    if (!deepbookPrice || !externalPrice) {
      return null;
    }

    // Calculate price discrepancy
    let effectiveExternalPrice = externalPrice.price;

    // Handle conversion if needed (e.g., USDT to USDC)
    if (monitoredPair.conversionRequired) {
      const conversionRate = await this.getConversionRate("USDT", "USDC");
      if (!conversionRate) return null;
      effectiveExternalPrice =
        effectiveExternalPrice.multipliedBy(conversionRate);
    }

    const priceDifference = deepbookPrice.price.minus(effectiveExternalPrice);
    const priceDiscrepancyPercent = priceDifference
      .dividedBy(effectiveExternalPrice)
      .abs();

    // Update monitored pair data
    monitoredPair.priceDiscrepancy = priceDiscrepancyPercent;
    monitoredPair.lastPriceCheck = Date.now();

    // Check if discrepancy is significant enough
    if (priceDiscrepancyPercent.isLessThan(this.minProfitThreshold)) {
      return null;
    }

    // Determine arbitrage direction
    const shouldBuyOnDeepbook = deepbookPrice.price.isLessThan(
      effectiveExternalPrice
    );
    const direction = shouldBuyOnDeepbook ? "buy-deepbook" : "sell-deepbook";

    // Calculate optimal trade amount
    const optimalAmount = this.calculateOptimalTradeAmount(
      monitoredPair,
      deepbookPrice.price,
      effectiveExternalPrice,
      direction
    );

    if (optimalAmount.isLessThanOrEqualTo(0)) {
      return null;
    }

    // Calculate expected profit
    const expectedProfit = this.calculateExpectedProfit(
      optimalAmount,
      deepbookPrice.price,
      effectiveExternalPrice,
      direction
    );

    // Estimate gas cost
    const gasEstimate = this.estimateGasCost();

    // Check if profitable after gas
    if (
      !MathUtils.isProfitableAfterGas(
        expectedProfit,
        gasEstimate,
        this.minProfitThreshold.multipliedBy(optimalAmount)
      )
    ) {
      return null;
    }

    const opportunity: FlashLoanOpportunity = {
      id: this.generateOpportunityId(monitoredPair, direction),
      type: "cross-dex",
      pools: [monitoredPair.deepbookPair],
      path: [monitoredPair.baseAsset, monitoredPair.quoteAsset],
      expectedProfit,
      profitPercentage: priceDiscrepancyPercent,
      tradeAmount: optimalAmount,
      gasEstimate,
      confidence: new BigNumber(this.calculateConfidence(
        priceDiscrepancyPercent,
        externalPrice.volume24h
      )),
      timestamp: Date.now(),
    };

    Logger.arbitrage("Cross-DEX arbitrage opportunity found", {
      pair: monitoredPair.externalSymbol,
      direction,
      priceDiscrepancy: priceDiscrepancyPercent.toString(),
      expectedProfit: expectedProfit.toString(),
      tradeAmount: optimalAmount.toString(),
      deepbookPrice: deepbookPrice.price.toString(),
      externalPrice: effectiveExternalPrice.toString(),
    });

    return opportunity;
  }

  /**
   * Calculate optimal trade amount for cross-DEX arbitrage
   */
  private calculateOptimalTradeAmount(
    monitoredPair: MonitoredPair,
    deepbookPrice: BigNumber,
    externalPrice: BigNumber,
    direction: "buy-deepbook" | "sell-deepbook"
  ): BigNumber {
    // Get available liquidity
    const availableLiquidity = this.getAvailableLiquidity(monitoredPair);

    // Calculate maximum profitable amount considering slippage
    const maxProfitableAmount = this.calculateMaxProfitableAmount(
      deepbookPrice,
      externalPrice,
      direction
    );

    // Return the minimum of available liquidity and max profitable amount
    return BigNumber.min(availableLiquidity, maxProfitableAmount);
  }

  /**
   * Get available liquidity for a trading pair
   */
  private getAvailableLiquidity(monitoredPair: MonitoredPair): BigNumber {
    if (!monitoredPair.deepbookPair) return new BigNumber(0);

    const price = this.deepBookService.getPrice(
      monitoredPair.deepbookPair.symbol
    );
    if (!price) return new BigNumber(0);

    // Use 24h volume as a proxy for available liquidity
    // In practice, this should use order book depth
    return price.volume24h.multipliedBy(0.1); // Use 10% of daily volume as conservative estimate
  }

  /**
   * Calculate maximum profitable amount considering slippage
   */
  private calculateMaxProfitableAmount(
    deepbookPrice: BigNumber,
    externalPrice: BigNumber,
    direction: "buy-deepbook" | "sell-deepbook"
  ): BigNumber {
    // Simple model - in practice would need sophisticated slippage modeling
    const baseLiquidity = new BigNumber(10000000000); // 10 SUI equivalent
    const priceDiff = deepbookPrice.minus(externalPrice).abs();
    const relativeDiff = priceDiff.dividedBy(externalPrice);

    // Higher price difference allows for larger trades
    return baseLiquidity.multipliedBy(relativeDiff.multipliedBy(100).plus(1));
  }

  /**
   * Calculate expected profit for cross-DEX arbitrage
   */
  private calculateExpectedProfit(
    amount: BigNumber,
    deepbookPrice: BigNumber,
    externalPrice: BigNumber,
    direction: "buy-deepbook" | "sell-deepbook"
  ): BigNumber {
    let profit: BigNumber;

    if (direction === "buy-deepbook") {
      // Buy on DeepBook (cheaper), sell externally (more expensive)
      const buyValue = amount.multipliedBy(deepbookPrice);
      const sellValue = amount.multipliedBy(externalPrice);
      profit = sellValue.minus(buyValue);
    } else {
      // Buy externally (cheaper), sell on DeepBook (more expensive)
      const buyValue = amount.multipliedBy(externalPrice);
      const sellValue = amount.multipliedBy(deepbookPrice);
      profit = sellValue.minus(buyValue);
    }

    // Account for trading fees (simplified)
    const tradingFees = amount.multipliedBy(0.005); // 0.5% total fees
    return profit.minus(tradingFees);
  }

  /**
   * Get conversion rate between two assets (e.g., USDT to USDC)
   */
  private async getConversionRate(
    fromAsset: string,
    toAsset: string
  ): Promise<BigNumber | null> {
    try {
      // For USDT to USDC, rate is approximately 1:1
      if (
        (fromAsset === "USDT" && toAsset === "USDC") ||
        (fromAsset === "USDC" && toAsset === "USDT")
      ) {
        return new BigNumber(1);
      }

      // For other conversions, would need to implement proper price feeds
      return new BigNumber(1);
    } catch (error) {
      Logger.error("Error getting conversion rate", {
        fromAsset,
        toAsset,
        error,
      });
      return null;
    }
  }

  /**
   * Estimate gas cost for cross-DEX arbitrage
   */
  private estimateGasCost(): BigNumber {
    // Cross-DEX arbitrage typically requires more gas due to external interactions
    return new BigNumber(80000000); // 0.08 SUI
  }

  /**
   * Calculate confidence score for cross-DEX opportunity
   */
  private calculateConfidence(
    priceDiscrepancy: BigNumber,
    externalVolume: BigNumber
  ): number {
    let confidence = 0.3; // Base confidence (lower than triangular arbitrage)

    // Higher price discrepancy = higher confidence
    const discrepancyBonus = Math.min(priceDiscrepancy.toNumber() * 20, 0.4);
    confidence += discrepancyBonus;

    // Higher external volume = higher confidence
    const volumeBonus = Math.min(externalVolume.toNumber() / 1000000, 0.2);
    confidence += volumeBonus;

    return Math.min(confidence, 0.85);
  }

  /**
   * Generate unique opportunity ID
   */
  private generateOpportunityId(
    monitoredPair: MonitoredPair,
    direction: string
  ): string {
    const pairStr = monitoredPair.externalSymbol.replace("/", "-");
    const timestamp = Date.now();
    return `cross-dex-${pairStr}-${direction}-${timestamp}`;
  }

  /**
   * Execute cross-DEX arbitrage opportunity
   */
  async execute(opportunity: FlashLoanOpportunity): Promise<FlashLoanResult> {
    Logger.arbitrage("Executing cross-DEX arbitrage", {
      opportunityId: opportunity.id,
      expectedProfit: opportunity.expectedProfit.toString(),
    });

    try {
      // Note: This is a simplified implementation
      // Real cross-DEX arbitrage would require integration with external exchanges
      // For now, we'll use the DeepBook flash loan mechanism
      return await this.deepBookService.executeFlashLoanArbitrage(opportunity);
    } catch (error) {
      Logger.error("Cross-DEX arbitrage execution failed", {
        opportunityId: opportunity.id,
        error,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        executionTime: 0,
      };
    }
  }

  /**
   * Get monitored pairs statistics
   */
  getStatistics(): {
    totalPairs: number;
    activePairs: number;
    avgDiscrepancy: BigNumber;
    lastUpdate: number;
  } {
    const activePairs = this.monitoredPairs.filter((pair) =>
      pair.priceDiscrepancy.isGreaterThan(0)
    );

    const totalDiscrepancy = this.monitoredPairs.reduce(
      (sum, pair) => sum.plus(pair.priceDiscrepancy),
      new BigNumber(0)
    );

    const avgDiscrepancy =
      this.monitoredPairs.length > 0
        ? totalDiscrepancy.dividedBy(this.monitoredPairs.length)
        : new BigNumber(0);

    const lastUpdate = Math.max(
      ...this.monitoredPairs.map((pair) => pair.lastPriceCheck)
    );

    return {
      totalPairs: this.monitoredPairs.length,
      activePairs: activePairs.length,
      avgDiscrepancy,
      lastUpdate,
    };
  }
}

interface MonitoredPair {
  deepbookPair: TradingPair | null;
  externalSymbol: string;
  baseAsset: string;
  quoteAsset: string;
  conversionRequired: boolean;
  priority: number;
  lastPriceCheck: number;
  priceDiscrepancy: BigNumber;
}

export default CrossDexArbitrageStrategy;
