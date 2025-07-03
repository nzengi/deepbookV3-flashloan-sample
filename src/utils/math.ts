import BigNumber from 'bignumber.js';

// Configure BigNumber for precision
BigNumber.config({
  DECIMAL_PLACES: 18,
  ROUNDING_MODE: BigNumber.ROUND_DOWN,
  EXPONENTIAL_AT: [-18, 18]
});

export class MathUtils {
  /**
   * Calculate the output amount for a given input amount in an AMM pool
   * Using the constant product formula: x * y = k
   */
  static calculateAmmOutput(
    inputAmount: BigNumber,
    inputReserve: BigNumber,
    outputReserve: BigNumber,
    feeRate: BigNumber = new BigNumber(0.003) // 0.3% default fee
  ): BigNumber {
    const inputAmountWithFee = inputAmount.multipliedBy(
      new BigNumber(1).minus(feeRate)
    );
    
    const numerator = inputAmountWithFee.multipliedBy(outputReserve);
    const denominator = inputReserve.plus(inputAmountWithFee);
    
    return numerator.dividedBy(denominator);
  }

  /**
   * Calculate price impact for a trade
   */
  static calculatePriceImpact(
    inputAmount: BigNumber,
    inputReserve: BigNumber,
    outputReserve: BigNumber
  ): BigNumber {
    const spotPrice = outputReserve.dividedBy(inputReserve);
    const outputAmount = this.calculateAmmOutput(inputAmount, inputReserve, outputReserve);
    const effectivePrice = outputAmount.dividedBy(inputAmount);
    
    return spotPrice.minus(effectivePrice).dividedBy(spotPrice).abs();
  }

  /**
   * Calculate arbitrage profit for triangular arbitrage
   */
  static calculateTriangularArbitrageProfit(
    startAmount: BigNumber,
    pool1Reserve1: BigNumber,
    pool1Reserve2: BigNumber,
    pool2Reserve1: BigNumber,
    pool2Reserve2: BigNumber,
    pool3Reserve1: BigNumber,
    pool3Reserve2: BigNumber,
    feeRate: BigNumber = new BigNumber(0.003)
  ): { profit: BigNumber; profitPercentage: BigNumber; endAmount: BigNumber } {
    // Step 1: Trade in pool 1
    const amount1 = this.calculateAmmOutput(startAmount, pool1Reserve1, pool1Reserve2, feeRate);
    
    // Step 2: Trade in pool 2
    const amount2 = this.calculateAmmOutput(amount1, pool2Reserve1, pool2Reserve2, feeRate);
    
    // Step 3: Trade in pool 3
    const endAmount = this.calculateAmmOutput(amount2, pool3Reserve1, pool3Reserve2, feeRate);
    
    const profit = endAmount.minus(startAmount);
    const profitPercentage = profit.dividedBy(startAmount);
    
    return { profit, profitPercentage, endAmount };
  }

  /**
   * Calculate optimal trade amount for arbitrage using binary search
   */
  static findOptimalTradeAmount(
    minAmount: BigNumber,
    maxAmount: BigNumber,
    calculateProfit: (amount: BigNumber) => BigNumber,
    precision: BigNumber = new BigNumber(0.001)
  ): { amount: BigNumber; profit: BigNumber } {
    let left = minAmount;
    let right = maxAmount;
    let bestAmount = minAmount;
    let bestProfit = calculateProfit(minAmount);
    
    const iterations = 50; // Maximum iterations to prevent infinite loop
    
    for (let i = 0; i < iterations; i++) {
      if (right.minus(left).isLessThan(precision)) {
        break;
      }
      
      const mid1 = left.plus(right.minus(left).dividedBy(3));
      const mid2 = right.minus(right.minus(left).dividedBy(3));
      
      const profit1 = calculateProfit(mid1);
      const profit2 = calculateProfit(mid2);
      
      if (profit1.isGreaterThan(bestProfit)) {
        bestProfit = profit1;
        bestAmount = mid1;
      }
      
      if (profit2.isGreaterThan(bestProfit)) {
        bestProfit = profit2;
        bestAmount = mid2;
      }
      
      if (profit1.isGreaterThan(profit2)) {
        right = mid2;
      } else {
        left = mid1;
      }
    }
    
    return { amount: bestAmount, profit: bestProfit };
  }

  /**
   * Convert between different decimal precisions
   */
  static convertDecimals(
    amount: BigNumber,
    fromDecimals: number,
    toDecimals: number
  ): BigNumber {
    if (fromDecimals === toDecimals) {
      return amount;
    }
    
    if (fromDecimals > toDecimals) {
      return amount.dividedBy(new BigNumber(10).pow(fromDecimals - toDecimals));
    } else {
      return amount.multipliedBy(new BigNumber(10).pow(toDecimals - fromDecimals));
    }
  }

  /**
   * Format amount to human readable string
   */
  static formatAmount(
    amount: BigNumber,
    decimals: number,
    precision: number = 6
  ): string {
    const divisor = new BigNumber(10).pow(decimals);
    const humanAmount = amount.dividedBy(divisor);
    return humanAmount.toFixed(precision);
  }

  /**
   * Parse human readable amount to blockchain units
   */
  static parseAmount(
    amount: string | number,
    decimals: number
  ): BigNumber {
    const multiplier = new BigNumber(10).pow(decimals);
    return new BigNumber(amount).multipliedBy(multiplier);
  }

  /**
   * Calculate gas cost in human readable format
   */
  static calculateGasCost(
    gasUsed: BigNumber,
    gasPrice: BigNumber,
    decimals: number = 9
  ): BigNumber {
    const totalCost = gasUsed.multipliedBy(gasPrice);
    return totalCost.dividedBy(new BigNumber(10).pow(decimals));
  }

  /**
   * Calculate slippage tolerance
   */
  static calculateSlippageTolerance(
    expectedAmount: BigNumber,
    slippagePercentage: BigNumber
  ): BigNumber {
    const slippageAmount = expectedAmount.multipliedBy(slippagePercentage);
    return expectedAmount.minus(slippageAmount);
  }

  /**
   * Check if profit meets minimum threshold after gas costs
   */
  static isProfitableAfterGas(
    grossProfit: BigNumber,
    gasCost: BigNumber,
    minProfitThreshold: BigNumber
  ): boolean {
    const netProfit = grossProfit.minus(gasCost);
    return netProfit.isGreaterThan(minProfitThreshold);
  }

  /**
   * Calculate moving average
   */
  static calculateMovingAverage(values: BigNumber[], window: number): BigNumber {
    if (values.length < window) {
      return new BigNumber(0);
    }
    
    const recentValues = values.slice(-window);
    const sum = recentValues.reduce((acc, val) => acc.plus(val), new BigNumber(0));
    return sum.dividedBy(window);
  }

  /**
   * Calculate standard deviation
   */
  static calculateStandardDeviation(values: BigNumber[]): BigNumber {
    if (values.length < 2) {
      return new BigNumber(0);
    }
    
    const mean = values.reduce((acc, val) => acc.plus(val), new BigNumber(0))
                      .dividedBy(values.length);
    
    const squaredDiffs = values.map(val => val.minus(mean).pow(2));
    const avgSquaredDiff = squaredDiffs.reduce((acc, val) => acc.plus(val), new BigNumber(0))
                                      .dividedBy(values.length);
    
    return avgSquaredDiff.sqrt();
  }

  /**
   * Calculate Value at Risk (VaR)
   */
  static calculateVaR(
    returns: BigNumber[],
    confidenceLevel: number = 0.95
  ): BigNumber {
    if (returns.length === 0) {
      return new BigNumber(0);
    }
    
    const sortedReturns = returns.sort((a, b) => {
      const result = a.comparedTo(b);
      return result === null ? 0 : result;
    });
    const index = Math.floor((1 - confidenceLevel) * sortedReturns.length);
    
    return sortedReturns[index] || new BigNumber(0);
  }

  /**
   * Calculate Sharpe ratio
   */
  static calculateSharpeRatio(
    returns: BigNumber[],
    riskFreeRate: BigNumber = new BigNumber(0)
  ): BigNumber {
    if (returns.length < 2) {
      return new BigNumber(0);
    }
    
    const excessReturns = returns.map(r => r.minus(riskFreeRate));
    const meanExcessReturn = this.calculateMovingAverage(excessReturns, excessReturns.length);
    const stdDev = this.calculateStandardDeviation(excessReturns);
    
    if (stdDev.isZero()) {
      return new BigNumber(0);
    }
    
    return meanExcessReturn.dividedBy(stdDev);
  }

  /**
   * Calculate compound annual growth rate (CAGR)
   */
  static calculateCAGR(
    beginningValue: BigNumber,
    endingValue: BigNumber,
    numberOfPeriods: number
  ): BigNumber {
    if (beginningValue.isZero() || numberOfPeriods <= 0) {
      return new BigNumber(0);
    }
    
    const ratio = endingValue.dividedBy(beginningValue);
    const exponent = 1 / numberOfPeriods;
    
    // Using approximation for fractional exponents
    const cagr = ratio.pow(exponent).minus(1);
    return cagr;
  }
}

export default MathUtils;