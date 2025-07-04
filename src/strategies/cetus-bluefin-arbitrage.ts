import { BigNumber } from 'bignumber.js';
import { DeepBookService } from '../services/deepbook';
import { CetusDexService } from '../services/cetus-dex';
import { BluefinDexService } from '../services/bluefin-dex';
import { Logger } from '../utils/logger';
import { ArbitrageStrategy, FlashLoanOpportunity, FlashLoanResult } from '../types';

/**
 * Cetus-BlueFin Arbitrage Strategy
 * 
 * Identifies arbitrage opportunities between Cetus DEX and BlueFin DEX
 * by comparing prices and executing trades through DeepBook flash loans
 */
export class CetusBlueFinArbitrageStrategy implements ArbitrageStrategy {
  public readonly name = 'Cetus-BlueFin Arbitrage';
  public enabled = true;
  public minProfitThreshold: BigNumber;
  public maxSlippage: BigNumber;
  public priority = 2;
  public riskLevel: 'low' | 'medium' | 'high' = 'medium';

  private deepBookService: DeepBookService;
  private cetusService: CetusDexService;
  private bluefinService: BluefinDexService;

  constructor(
    deepBookService: DeepBookService,
    cetusService: CetusDexService,
    bluefinService: BluefinDexService,
    minProfitThreshold: BigNumber,
    maxSlippage: BigNumber
  ) {
    this.deepBookService = deepBookService;
    this.cetusService = cetusService;
    this.bluefinService = bluefinService;
    this.minProfitThreshold = minProfitThreshold;
    this.maxSlippage = maxSlippage;
  }

  /**
   * Scan for arbitrage opportunities between Cetus and BlueFin
   */
  async scanOpportunities(): Promise<FlashLoanOpportunity[]> {
    const opportunities: FlashLoanOpportunity[] = [];

    try {
      // Get trading pairs from both DEXs
      const cetusPools = this.cetusService.getAllPools();
      const bluefinPools = this.bluefinService.getAllPools();

      // Focus on common pairs
      const commonPairs = ['SUI-USDC', 'WETH-USDC', 'USDC-USDT'];

      for (const pair of commonPairs) {
        const opportunity = await this.analyzeArbitrageOpportunity(pair);
        if (opportunity) {
          opportunities.push(opportunity);
        }
      }

      return opportunities;
    } catch (error) {
      Logger.error('Failed to scan Cetus-BlueFin arbitrage opportunities', { error });
      return [];
    }
  }

  /**
   * Analyze a specific pair for arbitrage opportunities
   */
  private async analyzeArbitrageOpportunity(pair: string): Promise<FlashLoanOpportunity | null> {
    try {
      // Get prices from both DEXs
      const cetusPrice = await this.cetusService.getPrice(pair);
      const bluefinPrice = await this.bluefinService.getPrice(pair);

      if (!cetusPrice || !bluefinPrice) {
        Logger.debug(`Price data not available for ${pair}`);
        return null;
      }

      // Calculate price discrepancy
      const priceDiscrepancy = cetusPrice.minus(bluefinPrice).abs();
      const priceDiscrepancyPercent = priceDiscrepancy.dividedBy(cetusPrice.plus(bluefinPrice).dividedBy(2)).multipliedBy(100);

      // Check if discrepancy is profitable
      if (priceDiscrepancyPercent.isLessThan(this.minProfitThreshold.multipliedBy(100))) {
        return null;
      }

      // Determine trade direction
      const buyFromCetus = cetusPrice.isLessThan(bluefinPrice);
      const tradeSize = this.calculateOptimalTradeSize(cetusPrice);

      // Calculate expected profit
      const buyPrice = buyFromCetus ? cetusPrice : bluefinPrice;
      const sellPrice = buyFromCetus ? bluefinPrice : cetusPrice;
      const expectedProfit = sellPrice.minus(buyPrice).multipliedBy(tradeSize);

      // Account for trading fees and gas costs
      const tradingFees = tradeSize.multipliedBy(new BigNumber(0.003)); // 0.3% total fees
      const gasCost = new BigNumber(0.1); // ~0.1 SUI gas cost
      const netProfit = expectedProfit.minus(tradingFees).minus(gasCost);

      // Check if still profitable after fees
      if (netProfit.isLessThanOrEqualTo(0)) {
        return null;
      }

      const profitPercentage = netProfit.dividedBy(tradeSize).multipliedBy(100);

      // Build opportunity object
      const opportunity: FlashLoanOpportunity = {
        id: `cetus-bluefin-${pair}-${Date.now()}`,
        type: 'cross-dex',
        strategy: this.name,
        asset: pair.split('-')[0],
        amount: tradeSize,
        pools: [], // Will be populated with actual pool data
        path: [pair],
        expectedProfit: netProfit,
        profitPercentage: profitPercentage,
        tradeAmount: tradeSize,
        gasEstimate: gasCost,
        estimatedGas: gasCost,
        confidence: this.calculateConfidence(priceDiscrepancyPercent),
        maxSlippage: this.maxSlippage,
        deadline: Date.now() + 30000,
        timestamp: Date.now(),
        metadata: {
          cetusPrice: cetusPrice.toString(),
          bluefinPrice: bluefinPrice.toString(),
          priceDiscrepancy: priceDiscrepancy.toString(),
          buyFromCetus: buyFromCetus.toString(),
          tradeDirection: buyFromCetus ? 'cetus->bluefin' : 'bluefin->cetus'
        }
      };

      return opportunity;
    } catch (error) {
      Logger.error(`Failed to analyze arbitrage for ${pair}`, { error });
      return null;
    }
  }

  /**
   * Execute the arbitrage opportunity
   */
  async execute(opportunity: FlashLoanOpportunity): Promise<FlashLoanResult> {
    const startTime = Date.now();

    try {
      Logger.flashloan(`Executing Cetus-BlueFin arbitrage: ${opportunity.asset}`, {
        amount: opportunity.amount.toString(),
        expectedProfit: opportunity.expectedProfit.toString(),
        profitPercentage: opportunity.profitPercentage.toString()
      });

      // Execute through DeepBook flash loan
      const result = await this.deepBookService.executeFlashLoanArbitrage(opportunity);

      const executionTime = Date.now() - startTime;

      Logger.profit(`Arbitrage completed: ${opportunity.asset}`, {
        success: result.success,
        actualProfit: result.actualProfit?.toString(),
        executionTime: executionTime,
        txHash: result.txHash
      });

      return result;
    } catch (error) {
      Logger.error(`Failed to execute Cetus-BlueFin arbitrage: ${opportunity.asset}`, {
        error: error.message,
        opportunity: opportunity.id,
        executionTime: Date.now() - startTime
      });

      return {
        success: false,
        actualProfit: new BigNumber(0),
        gasUsed: new BigNumber(0.1),
        executionTime: Date.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Calculate optimal trade size based on price and liquidity
   */
  private calculateOptimalTradeSize(price: BigNumber): BigNumber {
    // Conservative approach: start with 10 SUI equivalent
    const baseAmount = new BigNumber(10);
    
    // Adjust based on price volatility and available liquidity
    // This is a simplified calculation - in production, would use more sophisticated sizing
    return baseAmount.dividedBy(price).multipliedBy(new BigNumber(0.8)); // 80% of calculated amount for safety
  }

  /**
   * Calculate confidence score for the opportunity
   */
  private calculateConfidence(priceDiscrepancyPercent: BigNumber): BigNumber {
    // Higher discrepancy = higher confidence, but capped at reasonable levels
    let confidence = priceDiscrepancyPercent.multipliedBy(10); // Scale up
    
    // Cap confidence between 0.5 and 0.95
    confidence = BigNumber.min(confidence, new BigNumber(0.95));
    confidence = BigNumber.max(confidence, new BigNumber(0.5));
    
    return confidence;
  }
}