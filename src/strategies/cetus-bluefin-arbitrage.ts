import BigNumber from 'bignumber.js';
import { Logger } from '../utils/logger';
import { 
  FlashLoanOpportunity, 
  FlashLoanResult, 
  ArbitrageStrategy,
  BotConfig 
} from '../types/index';
import { DeepBookService } from '../services/deepbook';
import CetusDexService from '../services/cetus-dex';
import BluefinDexService from '../services/bluefin-dex';

/**
 * Cetus-BlueFin Flash Loan Arbitrage Strategy
 * 
 * Real arbitrage strategy that:
 * 1. Borrows SUI/USDC via DeepBook flash loan
 * 2. Executes trade on Cetus DEX 
 * 3. Executes opposite trade on BlueFin DEX
 * 4. Repays flash loan + captures profit
 */
export class CetusBlueFinArbitrageStrategy implements ArbitrageStrategy {
  public readonly name = 'Cetus-BlueFin Flash Loan Arbitrage';
  public enabled = true;
  public minProfitThreshold: BigNumber;
  public maxSlippage: BigNumber;
  public priority = 1; // Highest priority for real arbitrage
  public riskLevel: 'low' | 'medium' | 'high' = 'medium';

  private deepBookService: DeepBookService;
  private cetusService: CetusDexService;
  private bluefinService: BluefinDexService;
  private config: BotConfig;

  // Focus on profitable SUI/USDC arbitrage
  private readonly MONITORED_PAIRS = ['SUI/USDC'];
  private readonly MIN_PROFIT_USD = new BigNumber(0.1); // $0.10 minimum profit
  private readonly MAX_POSITION_SIZE = new BigNumber(1000); // $1000 max per trade

  constructor(
    deepBookService: DeepBookService,
    cetusService: CetusDexService,
    bluefinService: BluefinDexService,
    config: BotConfig
  ) {
    this.deepBookService = deepBookService;
    this.cetusService = cetusService;
    this.bluefinService = bluefinService;
    this.config = config;
    this.minProfitThreshold = new BigNumber(0.002); // 0.2% minimum profit
    this.maxSlippage = new BigNumber(0.015); // 1.5% max slippage

    Logger.info('Cetus-BlueFin arbitrage strategy initialized', {
      pairs: this.MONITORED_PAIRS,
      minProfit: this.minProfitThreshold.toString()
    });
  }

  /**
   * Scan for arbitrage opportunities between Cetus and BlueFin
   */
  async scanOpportunities(): Promise<FlashLoanOpportunity[]> {
    const opportunities: FlashLoanOpportunity[] = [];

    for (const pair of this.MONITORED_PAIRS) {
      try {
        // Get prices from both DEXes
        const cetusPrice = await this.cetusService.getPrice(pair);
        const bluefinPrice = await this.bluefinService.getPrice(pair);

        if (!cetusPrice || !bluefinPrice) {
          Logger.external(`Missing price data for ${pair}`, {
            cetusPrice: cetusPrice?.toString(),
            bluefinPrice: bluefinPrice?.toString()
          });
          continue;
        }

        // Calculate price difference
        const priceDiff = cetusPrice.minus(bluefinPrice).abs();
        const avgPrice = cetusPrice.plus(bluefinPrice).dividedBy(2);
        const priceDiscrepancy = priceDiff.dividedBy(avgPrice);

        Logger.external(`Price check ${pair}`, {
          cetusPrice: cetusPrice.toFixed(4),
          bluefinPrice: bluefinPrice.toFixed(4),
          discrepancy: priceDiscrepancy.toFixed(4)
        });

        // Check if arbitrage is profitable
        if (priceDiscrepancy.isGreaterThan(this.minProfitThreshold)) {
          const opportunity = await this.calculateArbitrageOpportunity(
            pair,
            cetusPrice,
            bluefinPrice,
            priceDiscrepancy
          );

          if (opportunity && opportunity.expectedProfit.isGreaterThan(this.MIN_PROFIT_USD)) {
            opportunities.push(opportunity);
            
            Logger.arbitrage(`Profitable arbitrage found: ${pair}`, {
              profit: opportunity.expectedProfit.toFixed(4),
              cetusPrice: cetusPrice.toFixed(4),
              bluefinPrice: bluefinPrice.toFixed(4),
              discrepancy: priceDiscrepancy.toFixed(4)
            });
          }
        }
      } catch (error) {
        Logger.error(`Error scanning ${pair} arbitrage`, { error });
      }
    }

    return opportunities.sort((a, b) => 
      b.expectedProfit.minus(a.expectedProfit).toNumber()
    );
  }

  /**
   * Calculate optimal arbitrage opportunity
   */
  private async calculateArbitrageOpportunity(
    pair: string,
    cetusPrice: BigNumber,
    bluefinPrice: BigNumber,
    priceDiscrepancy: BigNumber
  ): Promise<FlashLoanOpportunity | null> {
    try {
      // Determine arbitrage direction
      const buyFromCetus = cetusPrice.isLessThan(bluefinPrice);
      const buyPrice = buyFromCetus ? cetusPrice : bluefinPrice;
      const sellPrice = buyFromCetus ? bluefinPrice : cetusPrice;

      // Calculate optimal trade size (based on liquidity and risk)
      const tradeSize = this.calculateOptimalTradeSize(buyPrice);

      // Simulate trades on both DEXes
      const buyResult = buyFromCetus 
        ? await this.cetusService.getAmountOut(pair, tradeSize, false) // Buy SUI with USDC
        : await this.bluefinService.simulateSwap(pair, tradeSize, false);

      const sellAmount = buyResult instanceof BigNumber ? buyResult : buyResult?.amountOut;
      if (!sellAmount || sellAmount.isLessThanOrEqualTo(0)) return null;

      const sellResult = buyFromCetus
        ? await this.bluefinService.simulateSwap(pair, sellAmount, true) // Sell SUI for USDC
        : await this.cetusService.getAmountOut(pair, sellAmount, true);

      const finalAmount = sellResult instanceof BigNumber ? sellResult : sellResult?.amountOut;
      if (!finalAmount || finalAmount.isLessThanOrEqualTo(0)) return null;

      // Calculate profit after fees and gas
      const profit = finalAmount.minus(tradeSize);
      const gasCost = new BigNumber(0.05); // ~0.05 SUI in USDC
      const netProfit = profit.minus(gasCost);

      if (netProfit.isLessThanOrEqualTo(0)) return null;

      // Create flash loan opportunity
      const opportunity: FlashLoanOpportunity = {
        id: this.generateOpportunityId(pair, buyFromCetus),
        type: 'cetus-bluefin-arbitrage',
        pair: pair,
        strategy: this.name,
        flashLoanAmount: tradeSize,
        flashLoanAsset: 'USDC',
        expectedProfit: netProfit,
        confidence: this.calculateConfidence(priceDiscrepancy),
        estimatedGas: gasCost,
        maxSlippage: this.maxSlippage,
        deadline: Date.now() + 30000, // 30 seconds
        executionSteps: [
          {
            action: 'flashloan_borrow',
            dex: 'deepbook',
            asset: 'USDC',
            amount: tradeSize
          },
          {
            action: buyFromCetus ? 'buy' : 'sell',
            dex: buyFromCetus ? 'cetus' : 'bluefin',
            pair: pair,
            amount: tradeSize,
            expectedOutput: sellAmount
          },
          {
            action: buyFromCetus ? 'sell' : 'buy',
            dex: buyFromCetus ? 'bluefin' : 'cetus',
            pair: pair,
            amount: sellAmount,
            expectedOutput: finalAmount
          },
          {
            action: 'flashloan_repay',
            dex: 'deepbook',
            asset: 'USDC',
            amount: tradeSize
          }
        ],
        metadata: {
          cetusPrice: cetusPrice.toString(),
          bluefinPrice: bluefinPrice.toString(),
          priceDiscrepancy: priceDiscrepancy.toString(),
          buyFromCetus,
          tradeDirection: buyFromCetus ? 'cetus->bluefin' : 'bluefin->cetus'
        }
      };

      return opportunity;
    } catch (error) {
      Logger.error(`Failed to calculate arbitrage for ${pair}`, { error });
      return null;
    }
  }

  /**
   * Execute the arbitrage opportunity
   */
  async execute(opportunity: FlashLoanOpportunity): Promise<FlashLoanResult> {
    const startTime = Date.now();
    
    try {
      Logger.flashloan(`Executing Cetus-BlueFin arbitrage: ${opportunity.pair}`, {
        amount: opportunity.flashLoanAmount.toString(),
        expectedProfit: opportunity.expectedProfit.toString(),
        direction: opportunity.metadata?.tradeDirection
      });

      // Execute the flash loan arbitrage transaction
      const result = await this.deepBookService.executeFlashLoanArbitrage(opportunity);

      const executionTime = Date.now() - startTime;

      Logger.profit(`Arbitrage completed: ${opportunity.pair}`, {
        success: result.success,
        actualProfit: result.actualProfit?.toString(),
        executionTime: `${executionTime}ms`,
        gasUsed: result.gasUsed?.toString()
      });

      return result;
    } catch (error) {
      Logger.error(`Arbitrage execution failed: ${opportunity.pair}`, { error });
      
      return {
        success: false,
        actualProfit: new BigNumber(0),
        gasUsed: new BigNumber(0),
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Calculate optimal trade size based on available liquidity and risk
   */
  private calculateOptimalTradeSize(price: BigNumber): BigNumber {
    // Start with small position for safety
    const baseSize = new BigNumber(50); // $50 USD base size
    
    // Adjust based on price (more SUI if price is lower)
    const suiAmount = baseSize.dividedBy(price);
    
    // Cap at maximum position size
    const maxSuiAmount = this.MAX_POSITION_SIZE.dividedBy(price);
    
    return BigNumber.minimum(suiAmount, maxSuiAmount);
  }

  /**
   * Calculate confidence score based on price discrepancy
   */
  private calculateConfidence(priceDiscrepancy: BigNumber): BigNumber {
    // Higher discrepancy = higher confidence
    if (priceDiscrepancy.isGreaterThan(0.01)) return new BigNumber(0.9); // 90% confidence for >1%
    if (priceDiscrepancy.isGreaterThan(0.005)) return new BigNumber(0.8); // 80% confidence for >0.5%
    if (priceDiscrepancy.isGreaterThan(0.003)) return new BigNumber(0.7); // 70% confidence for >0.3%
    return new BigNumber(0.6); // 60% minimum confidence
  }

  /**
   * Generate unique opportunity ID
   */
  private generateOpportunityId(pair: string, buyFromCetus: boolean): string {
    const direction = buyFromCetus ? 'C2B' : 'B2C';
    const timestamp = Date.now().toString(36);
    return `${pair}_${direction}_${timestamp}`;
  }

  /**
   * Get strategy statistics
   */
  getStatistics(): {
    name: string;
    enabled: boolean;
    monitoredPairs: string[];
    minProfitThreshold: BigNumber;
    maxPositionSize: BigNumber;
  } {
    return {
      name: this.name,
      enabled: this.enabled,
      monitoredPairs: this.MONITORED_PAIRS,
      minProfitThreshold: this.minProfitThreshold,
      maxPositionSize: this.MAX_POSITION_SIZE
    };
  }
}

export default CetusBlueFinArbitrageStrategy;