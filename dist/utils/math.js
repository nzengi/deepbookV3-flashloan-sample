"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MathUtils = void 0;
const bignumber_js_1 = __importDefault(require("bignumber.js"));
bignumber_js_1.default.config({
    DECIMAL_PLACES: 18,
    ROUNDING_MODE: bignumber_js_1.default.ROUND_DOWN,
    EXPONENTIAL_AT: [-18, 18]
});
class MathUtils {
    static calculateAmmOutput(inputAmount, inputReserve, outputReserve, feeRate = new bignumber_js_1.default(0.003)) {
        const inputAmountWithFee = inputAmount.multipliedBy(new bignumber_js_1.default(1).minus(feeRate));
        const numerator = inputAmountWithFee.multipliedBy(outputReserve);
        const denominator = inputReserve.plus(inputAmountWithFee);
        return numerator.dividedBy(denominator);
    }
    static calculatePriceImpact(inputAmount, inputReserve, outputReserve) {
        const spotPrice = outputReserve.dividedBy(inputReserve);
        const outputAmount = this.calculateAmmOutput(inputAmount, inputReserve, outputReserve);
        const effectivePrice = outputAmount.dividedBy(inputAmount);
        return spotPrice.minus(effectivePrice).dividedBy(spotPrice).abs();
    }
    static calculateTriangularArbitrageProfit(startAmount, pool1Reserve1, pool1Reserve2, pool2Reserve1, pool2Reserve2, pool3Reserve1, pool3Reserve2, feeRate = new bignumber_js_1.default(0.003)) {
        const amount1 = this.calculateAmmOutput(startAmount, pool1Reserve1, pool1Reserve2, feeRate);
        const amount2 = this.calculateAmmOutput(amount1, pool2Reserve1, pool2Reserve2, feeRate);
        const endAmount = this.calculateAmmOutput(amount2, pool3Reserve1, pool3Reserve2, feeRate);
        const profit = endAmount.minus(startAmount);
        const profitPercentage = profit.dividedBy(startAmount);
        return { profit, profitPercentage, endAmount };
    }
    static findOptimalTradeAmount(minAmount, maxAmount, calculateProfit, precision = new bignumber_js_1.default(0.001)) {
        let left = minAmount;
        let right = maxAmount;
        let bestAmount = minAmount;
        let bestProfit = calculateProfit(minAmount);
        const iterations = 50;
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
            }
            else {
                left = mid1;
            }
        }
        return { amount: bestAmount, profit: bestProfit };
    }
    static convertDecimals(amount, fromDecimals, toDecimals) {
        if (fromDecimals === toDecimals) {
            return amount;
        }
        if (fromDecimals > toDecimals) {
            return amount.dividedBy(new bignumber_js_1.default(10).pow(fromDecimals - toDecimals));
        }
        else {
            return amount.multipliedBy(new bignumber_js_1.default(10).pow(toDecimals - fromDecimals));
        }
    }
    static formatAmount(amount, decimals, precision = 6) {
        const divisor = new bignumber_js_1.default(10).pow(decimals);
        const humanAmount = amount.dividedBy(divisor);
        return humanAmount.toFixed(precision);
    }
    static parseAmount(amount, decimals) {
        const multiplier = new bignumber_js_1.default(10).pow(decimals);
        return new bignumber_js_1.default(amount).multipliedBy(multiplier);
    }
    static calculateGasCost(gasUsed, gasPrice, decimals = 9) {
        const totalCost = gasUsed.multipliedBy(gasPrice);
        return totalCost.dividedBy(new bignumber_js_1.default(10).pow(decimals));
    }
    static calculateSlippageTolerance(expectedAmount, slippagePercentage) {
        const slippageAmount = expectedAmount.multipliedBy(slippagePercentage);
        return expectedAmount.minus(slippageAmount);
    }
    static isProfitableAfterGas(grossProfit, gasCost, minProfitThreshold) {
        const netProfit = grossProfit.minus(gasCost);
        return netProfit.isGreaterThan(minProfitThreshold);
    }
    static calculateMovingAverage(values, window) {
        if (values.length < window) {
            return new bignumber_js_1.default(0);
        }
        const recentValues = values.slice(-window);
        const sum = recentValues.reduce((acc, val) => acc.plus(val), new bignumber_js_1.default(0));
        return sum.dividedBy(window);
    }
    static calculateStandardDeviation(values) {
        if (values.length < 2) {
            return new bignumber_js_1.default(0);
        }
        const mean = values.reduce((acc, val) => acc.plus(val), new bignumber_js_1.default(0))
            .dividedBy(values.length);
        const squaredDiffs = values.map(val => val.minus(mean).pow(2));
        const avgSquaredDiff = squaredDiffs.reduce((acc, val) => acc.plus(val), new bignumber_js_1.default(0))
            .dividedBy(values.length);
        return avgSquaredDiff.sqrt();
    }
    static calculateVaR(returns, confidenceLevel = 0.95) {
        if (returns.length === 0) {
            return new bignumber_js_1.default(0);
        }
        const sortedReturns = returns.sort((a, b) => {
            const result = a.comparedTo(b);
            return result === null ? 0 : result;
        });
        const index = Math.floor((1 - confidenceLevel) * sortedReturns.length);
        return sortedReturns[index] || new bignumber_js_1.default(0);
    }
    static calculateSharpeRatio(returns, riskFreeRate = new bignumber_js_1.default(0)) {
        if (returns.length < 2) {
            return new bignumber_js_1.default(0);
        }
        const excessReturns = returns.map(r => r.minus(riskFreeRate));
        const meanExcessReturn = this.calculateMovingAverage(excessReturns, excessReturns.length);
        const stdDev = this.calculateStandardDeviation(excessReturns);
        if (stdDev.isZero()) {
            return new bignumber_js_1.default(0);
        }
        return meanExcessReturn.dividedBy(stdDev);
    }
    static calculateCAGR(beginningValue, endingValue, numberOfPeriods) {
        if (beginningValue.isZero() || numberOfPeriods <= 0) {
            return new bignumber_js_1.default(0);
        }
        const ratio = endingValue.dividedBy(beginningValue);
        const exponent = 1 / numberOfPeriods;
        const cagr = ratio.pow(exponent).minus(1);
        return cagr;
    }
}
exports.MathUtils = MathUtils;
exports.default = MathUtils;
//# sourceMappingURL=math.js.map