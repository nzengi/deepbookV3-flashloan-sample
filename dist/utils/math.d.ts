import BigNumber from 'bignumber.js';
export declare class MathUtils {
    static calculateAmmOutput(inputAmount: BigNumber, inputReserve: BigNumber, outputReserve: BigNumber, feeRate?: BigNumber): BigNumber;
    static calculatePriceImpact(inputAmount: BigNumber, inputReserve: BigNumber, outputReserve: BigNumber): BigNumber;
    static calculateTriangularArbitrageProfit(startAmount: BigNumber, pool1Reserve1: BigNumber, pool1Reserve2: BigNumber, pool2Reserve1: BigNumber, pool2Reserve2: BigNumber, pool3Reserve1: BigNumber, pool3Reserve2: BigNumber, feeRate?: BigNumber): {
        profit: BigNumber;
        profitPercentage: BigNumber;
        endAmount: BigNumber;
    };
    static findOptimalTradeAmount(minAmount: BigNumber, maxAmount: BigNumber, calculateProfit: (amount: BigNumber) => BigNumber, precision?: BigNumber): {
        amount: BigNumber;
        profit: BigNumber;
    };
    static convertDecimals(amount: BigNumber, fromDecimals: number, toDecimals: number): BigNumber;
    static formatAmount(amount: BigNumber, decimals: number, precision?: number): string;
    static parseAmount(amount: string | number, decimals: number): BigNumber;
    static calculateGasCost(gasUsed: BigNumber, gasPrice: BigNumber, decimals?: number): BigNumber;
    static calculateSlippageTolerance(expectedAmount: BigNumber, slippagePercentage: BigNumber): BigNumber;
    static isProfitableAfterGas(grossProfit: BigNumber, gasCost: BigNumber, minProfitThreshold: BigNumber): boolean;
    static calculateMovingAverage(values: BigNumber[], window: number): BigNumber;
    static calculateStandardDeviation(values: BigNumber[]): BigNumber;
    static calculateVaR(returns: BigNumber[], confidenceLevel?: number): BigNumber;
    static calculateSharpeRatio(returns: BigNumber[], riskFreeRate?: BigNumber): BigNumber;
    static calculateCAGR(beginningValue: BigNumber, endingValue: BigNumber, numberOfPeriods: number): BigNumber;
}
export default MathUtils;
//# sourceMappingURL=math.d.ts.map