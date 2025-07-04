import BigNumber from 'bignumber.js';
import { Logger } from '../utils/logger';
import { MathUtils } from '../utils/math';
import { 
  BotConfig, 
  RiskLimits, 
  RiskMetrics, 
  FlashLoanOpportunity,
  TradeLog,
  RiskManagementError
} from '../types/index';

/**
 * Risk Management Service
 * 
 * Manages trading risks including position limits, daily loss limits,
 * and overall portfolio risk assessment
 */
export class RiskManagementService {
  private config: BotConfig;
  private riskLimits: RiskLimits;
  private currentExposure: BigNumber = new BigNumber(0);
  private dailyPnL: BigNumber = new BigNumber(0);
  private tradeLogs: TradeLog[] = [];
  private activeTrades: number = 0;
  private dailyResetTime: number = 0;
  private returns: BigNumber[] = [];

  constructor(config: BotConfig) {
    this.config = config;
    this.riskLimits = config.riskLimits;
    this.dailyResetTime = this.getNextDailyReset();
  }

  /**
   * Evaluate if a trading opportunity meets risk criteria
   */
  async evaluateOpportunity(opportunity: FlashLoanOpportunity): Promise<{
    approved: boolean;
    reason?: string;
    adjustedAmount?: BigNumber;
  }> {
    try {
      // Check daily reset
      this.checkDailyReset();

      // 1. Check concurrent trades limit
      if (this.activeTrades >= this.riskLimits.maxConcurrentTrades) {
        return {
          approved: false,
          reason: 'Maximum concurrent trades limit reached'
        };
      }

      // 2. Check daily loss limit
      if (this.dailyPnL.isLessThan(this.riskLimits.maxDailyLoss.negated())) {
        return {
          approved: false,
          reason: 'Daily loss limit exceeded'
        };
      }

      // 3. Check position size limit
      const tradeAmount = opportunity.tradeAmount || opportunity.amount || new BigNumber(10);
      if (tradeAmount.isGreaterThan(this.riskLimits.maxPositionSize)) {
        const adjustedAmount = this.riskLimits.maxPositionSize;
        Logger.risk('Trade amount adjusted due to position size limit', {
          originalAmount: tradeAmount.toString(),
          adjustedAmount: adjustedAmount.toString()
        });

        return {
          approved: true,
          adjustedAmount
        };
      }

      // 4. Check slippage tolerance - profit should be greater than slippage
      const profitPercentage = opportunity.profitPercentage || new BigNumber(0);
      const slippageTolerance = this.riskLimits.maxSlippage || new BigNumber(0.005);
      
      // For flash loans, we need profit > slippage + gas costs
      const minRequiredProfit = slippageTolerance.plus(new BigNumber(0.002)); // Add 0.2% buffer for gas
      
      if (profitPercentage.isLessThan(minRequiredProfit)) {
        Logger.risk('Opportunity rejected: profit below required threshold', {
          opportunityId: opportunity.id,
          profitPercentage: profitPercentage.toString(),
          slippageTolerance: slippageTolerance.toString(),
          minRequiredProfit: minRequiredProfit.toString()
        });
        return {
          approved: false,
          reason: `Profit ${profitPercentage.multipliedBy(100).toFixed(2)}% below required threshold ${minRequiredProfit.multipliedBy(100).toFixed(2)}%`
        };
      }

      // 5. Check exposure limit
      const newExposure = this.currentExposure.plus(tradeAmount);
      const maxExposure = this.riskLimits.maxPositionSize.multipliedBy(3); // 3x position size
      
      if (newExposure.isGreaterThan(maxExposure)) {
        const availableExposure = maxExposure.minus(this.currentExposure);
        if (availableExposure.isLessThanOrEqualTo(0)) {
          return {
            approved: false,
            reason: 'Maximum exposure limit reached'
          };
        }

        return {
          approved: true,
          adjustedAmount: availableExposure
        };
      }

      // 6. Risk-adjusted sizing based on confidence
      const riskAdjustedAmount = this.calculateRiskAdjustedSize(opportunity);
      
      if (riskAdjustedAmount.isLessThan(tradeAmount)) {
        return {
          approved: true,
          adjustedAmount: riskAdjustedAmount
        };
      }

      return { approved: true };

    } catch (error) {
      Logger.error('Risk evaluation failed', { 
        opportunityId: opportunity.id, 
        error: error.message || error,
        stack: error.stack,
        opportunity: {
          id: opportunity.id,
          type: opportunity.type,
          confidence: opportunity.confidence?.toString(),
          profitPercentage: opportunity.profitPercentage?.toString(),
          tradeAmount: opportunity.tradeAmount?.toString()
        }
      });
      
      return {
        approved: false,
        reason: `Risk evaluation error: ${error.message || error}`
      };
    }
  }

  /**
   * Calculate risk-adjusted position size
   */
  private calculateRiskAdjustedSize(opportunity: FlashLoanOpportunity): BigNumber {
    try {
      // Kelly Criterion inspired sizing
      const confidence = opportunity.confidence || new BigNumber(0.5);
      const profitPercentage = opportunity.profitPercentage || new BigNumber(0.01);
      const tradeAmount = opportunity.tradeAmount || new BigNumber(10);
      
      // Validate inputs
      if (!confidence.isFinite() || !profitPercentage.isFinite() || !tradeAmount.isFinite()) {
        Logger.warn('Invalid values in risk calculation, using defaults', {
          confidence: confidence.toString(),
          profitPercentage: profitPercentage.toString(),
          tradeAmount: tradeAmount.toString()
        });
        return this.riskLimits.maxPositionSize.multipliedBy(0.1); // 10% of max position
      }
      
      // Conservative Kelly fraction (reduce by 50% for safety)
      const kellyFraction = confidence.toNumber() * profitPercentage.toNumber() * 0.5;
      
      // Apply Kelly sizing to max position size
      const baseAmount = this.riskLimits.maxPositionSize;
      const kellyAmount = baseAmount.multipliedBy(Math.min(Math.max(kellyFraction, 0.01), 0.25)); // Cap between 1% and 25%
      
      return BigNumber.min(kellyAmount, tradeAmount);
    } catch (error) {
      Logger.error('Error in calculateRiskAdjustedSize', { error, opportunityId: opportunity.id });
      // Return conservative default
      return this.riskLimits.maxPositionSize.multipliedBy(0.05); // 5% of max position
    }
  }

  /**
   * Record trade execution
   */
  recordTrade(tradeLog: TradeLog): void {
    this.tradeLogs.push(tradeLog);
    
    if (tradeLog.status === 'pending') {
      this.activeTrades++;
      this.currentExposure = this.currentExposure.plus(
        // Estimate exposure - would be more precise with actual trade data
        new BigNumber(100000000) // Placeholder
      );
    } else {
      this.activeTrades = Math.max(0, this.activeTrades - 1);
      
      if (tradeLog.profit) {
        const netProfit = tradeLog.profit.minus(tradeLog.gasCost || new BigNumber(0));
        this.dailyPnL = this.dailyPnL.plus(netProfit);
        this.returns.push(netProfit);
        
        // Limit returns array size for performance
        if (this.returns.length > 1000) {
          this.returns = this.returns.slice(-500);
        }
      }
      
      // Update exposure (simplified)
      this.currentExposure = BigNumber.max(
        new BigNumber(0),
        this.currentExposure.minus(new BigNumber(100000000))
      );
    }

    Logger.risk('Trade recorded', {
      tradeId: tradeLog.id,
      status: tradeLog.status,
      profit: tradeLog.profit?.toString(),
      dailyPnL: this.dailyPnL.toString(),
      activeTrades: this.activeTrades
    });
  }

  /**
   * Get current risk metrics
   */
  getRiskMetrics(): RiskMetrics {
    const totalTrades = this.tradeLogs.length;
    const successfulTrades = this.tradeLogs.filter(log => log.status === 'success').length;
    const winRate = totalTrades > 0 ? successfulTrades / totalTrades : 0;
    
    // Calculate max drawdown
    let maxDrawdown = new BigNumber(0);
    let peak = new BigNumber(0);
    let runningPnL = new BigNumber(0);
    
    for (const log of this.tradeLogs) {
      if (log.profit) {
        runningPnL = runningPnL.plus(log.profit);
        peak = BigNumber.max(peak, runningPnL);
        const drawdown = peak.minus(runningPnL);
        maxDrawdown = BigNumber.max(maxDrawdown, drawdown);
      }
    }

    // Calculate Sharpe ratio
    const sharpeRatio = this.returns.length > 1 
      ? MathUtils.calculateSharpeRatio(this.returns)
      : new BigNumber(0);

    // Determine current risk level
    const currentRisk = this.assessCurrentRiskLevel();

    return {
      totalExposure: this.currentExposure,
      dailyPnL: this.dailyPnL,
      winRate,
      maxDrawdown,
      sharpeRatio: sharpeRatio.toNumber(),
      currentRisk
    };
  }

  /**
   * Assess current risk level
   */
  private assessCurrentRiskLevel(): 'low' | 'medium' | 'high' {
    const exposureRatio = this.currentExposure.dividedBy(this.riskLimits.maxPositionSize);
    const dailyLossRatio = this.dailyPnL.negated().dividedBy(this.riskLimits.maxDailyLoss);
    
    if (exposureRatio.isGreaterThan(0.8) || dailyLossRatio.isGreaterThan(0.8)) {
      return 'high';
    } else if (exposureRatio.isGreaterThan(0.5) || dailyLossRatio.isGreaterThan(0.5)) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Check if daily reset is needed
   */
  private checkDailyReset(): void {
    const now = Date.now();
    if (now >= this.dailyResetTime) {
      this.resetDailyMetrics();
      this.dailyResetTime = this.getNextDailyReset();
      Logger.info('Daily risk metrics reset');
    }
  }

  /**
   * Reset daily metrics
   */
  private resetDailyMetrics(): void {
    this.dailyPnL = new BigNumber(0);
    
    // Clean up old trade logs (keep last 7 days)
    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    this.tradeLogs = this.tradeLogs.filter(log => log.timestamp > weekAgo);
  }

  /**
   * Get next daily reset time (midnight UTC)
   */
  private getNextDailyReset(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return tomorrow.getTime();
  }

  /**
   * Emergency shutdown check
   */
  shouldEmergencyShutdown(): boolean {
    const metrics = this.getRiskMetrics();
    
    // Shutdown conditions
    const conditions = [
      // Daily loss exceeds limit
      this.dailyPnL.isLessThan(this.riskLimits.maxDailyLoss.negated()),
      
      // Current risk is high and losing money
      metrics.currentRisk === 'high' && this.dailyPnL.isNegative(),
      
      // Win rate below 30% with significant losses
      metrics.winRate < 0.3 && this.dailyPnL.isLessThan(new BigNumber(-1000000000)),
      
      // Max drawdown exceeds 50% of daily limit
      metrics.maxDrawdown.isGreaterThan(this.riskLimits.maxDailyLoss.multipliedBy(0.5))
    ];

    const shouldShutdown = conditions.some(condition => condition);
    
    if (shouldShutdown) {
      Logger.security('Emergency shutdown triggered', { metrics });
    }
    
    return shouldShutdown;
  }

  /**
   * Get risk summary for monitoring
   */
  getRiskSummary(): {
    currentRisk: 'low' | 'medium' | 'high';
    dailyPnL: BigNumber;
    activeTrades: number;
    exposureUtilization: number;
    dailyLossUtilization: number;
    recommendations: string[];
  } {
    const exposureUtilization = this.currentExposure
      .dividedBy(this.riskLimits.maxPositionSize).toNumber();
    
    const dailyLossUtilization = this.dailyPnL.isNegative()
      ? this.dailyPnL.negated().dividedBy(this.riskLimits.maxDailyLoss).toNumber()
      : 0;

    const recommendations: string[] = [];
    
    if (exposureUtilization > 0.8) {
      recommendations.push('High exposure - consider reducing position sizes');
    }
    
    if (dailyLossUtilization > 0.7) {
      recommendations.push('Approaching daily loss limit - be cautious');
    }
    
    if (this.activeTrades >= this.riskLimits.maxConcurrentTrades * 0.8) {
      recommendations.push('High number of active trades - monitor closely');
    }

    const metrics = this.getRiskMetrics();
    if (metrics.winRate < 0.5 && this.tradeLogs.length > 10) {
      recommendations.push('Low win rate - review strategy parameters');
    }

    return {
      currentRisk: this.assessCurrentRiskLevel(),
      dailyPnL: this.dailyPnL,
      activeTrades: this.activeTrades,
      exposureUtilization,
      dailyLossUtilization,
      recommendations
    };
  }

  /**
   * Update risk limits
   */
  updateRiskLimits(newLimits: Partial<RiskLimits>): void {
    this.riskLimits = { ...this.riskLimits, ...newLimits };
    Logger.info('Risk limits updated', { newLimits });
  }

  /**
   * Get historical performance data
   */
  getPerformanceHistory(days: number = 7): {
    dailyReturns: { date: string; pnl: BigNumber }[];
    cumulativeReturn: BigNumber;
    volatility: BigNumber;
    maxDrawdown: BigNumber;
  } {
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
    const recentLogs = this.tradeLogs.filter(log => log.timestamp > cutoffTime);
    
    // Group by day
    const dailyData = new Map<string, BigNumber>();
    
    for (const log of recentLogs) {
      const date = new Date(log.timestamp).toISOString().split('T')[0];
      const profit = log.profit || new BigNumber(0);
      const existing = dailyData.get(date) || new BigNumber(0);
      dailyData.set(date, existing.plus(profit));
    }

    const dailyReturns = Array.from(dailyData.entries()).map(([date, pnl]) => ({
      date,
      pnl
    }));

    const returns = dailyReturns.map(d => d.pnl);
    const cumulativeReturn = returns.reduce((sum, ret) => sum.plus(ret), new BigNumber(0));
    const volatility = MathUtils.calculateStandardDeviation(returns);
    const maxDrawdown = this.getRiskMetrics().maxDrawdown;

    return {
      dailyReturns,
      cumulativeReturn,
      volatility,
      maxDrawdown
    };
  }
}

export default RiskManagementService;