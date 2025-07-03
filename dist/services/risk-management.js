"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskManagementService = void 0;
const bignumber_js_1 = __importDefault(require("bignumber.js"));
const logger_1 = require("../utils/logger");
const math_1 = require("../utils/math");
class RiskManagementService {
    constructor(config) {
        this.currentExposure = new bignumber_js_1.default(0);
        this.dailyPnL = new bignumber_js_1.default(0);
        this.tradeLogs = [];
        this.activeTrades = 0;
        this.dailyResetTime = 0;
        this.returns = [];
        this.config = config;
        this.riskLimits = config.riskLimits;
        this.dailyResetTime = this.getNextDailyReset();
    }
    async evaluateOpportunity(opportunity) {
        try {
            this.checkDailyReset();
            if (this.activeTrades >= this.riskLimits.maxConcurrentTrades) {
                return {
                    approved: false,
                    reason: 'Maximum concurrent trades limit reached'
                };
            }
            if (this.dailyPnL.isLessThan(this.riskLimits.maxDailyLoss.negated())) {
                return {
                    approved: false,
                    reason: 'Daily loss limit exceeded'
                };
            }
            if (opportunity.tradeAmount.isGreaterThan(this.riskLimits.maxPositionSize)) {
                const adjustedAmount = this.riskLimits.maxPositionSize;
                logger_1.Logger.risk('Trade amount adjusted due to position size limit', {
                    originalAmount: opportunity.tradeAmount.toString(),
                    adjustedAmount: adjustedAmount.toString()
                });
                return {
                    approved: true,
                    adjustedAmount
                };
            }
            if (opportunity.profitPercentage.isLessThan(this.riskLimits.maxSlippage)) {
                return {
                    approved: false,
                    reason: 'Profit margin below slippage tolerance'
                };
            }
            const newExposure = this.currentExposure.plus(opportunity.tradeAmount);
            const maxExposure = this.riskLimits.maxPositionSize.multipliedBy(3);
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
            const riskAdjustedAmount = this.calculateRiskAdjustedSize(opportunity);
            if (riskAdjustedAmount.isLessThan(opportunity.tradeAmount)) {
                return {
                    approved: true,
                    adjustedAmount: riskAdjustedAmount
                };
            }
            return { approved: true };
        }
        catch (error) {
            logger_1.Logger.error('Risk evaluation failed', {
                opportunityId: opportunity.id,
                error
            });
            return {
                approved: false,
                reason: 'Risk evaluation error'
            };
        }
    }
    calculateRiskAdjustedSize(opportunity) {
        const confidence = opportunity.confidence;
        const profitPercentage = opportunity.profitPercentage;
        const kellyFraction = confidence * profitPercentage.toNumber() * 0.5;
        const baseAmount = this.riskLimits.maxPositionSize;
        const kellyAmount = baseAmount.multipliedBy(Math.min(kellyFraction, 0.25));
        return bignumber_js_1.default.min(kellyAmount, opportunity.tradeAmount);
    }
    recordTrade(tradeLog) {
        this.tradeLogs.push(tradeLog);
        if (tradeLog.status === 'pending') {
            this.activeTrades++;
            this.currentExposure = this.currentExposure.plus(new bignumber_js_1.default(100000000));
        }
        else {
            this.activeTrades = Math.max(0, this.activeTrades - 1);
            if (tradeLog.profit) {
                const netProfit = tradeLog.profit.minus(tradeLog.gasCost || new bignumber_js_1.default(0));
                this.dailyPnL = this.dailyPnL.plus(netProfit);
                this.returns.push(netProfit);
                if (this.returns.length > 1000) {
                    this.returns = this.returns.slice(-500);
                }
            }
            this.currentExposure = bignumber_js_1.default.max(new bignumber_js_1.default(0), this.currentExposure.minus(new bignumber_js_1.default(100000000)));
        }
        logger_1.Logger.risk('Trade recorded', {
            tradeId: tradeLog.id,
            status: tradeLog.status,
            profit: tradeLog.profit?.toString(),
            dailyPnL: this.dailyPnL.toString(),
            activeTrades: this.activeTrades
        });
    }
    getRiskMetrics() {
        const totalTrades = this.tradeLogs.length;
        const successfulTrades = this.tradeLogs.filter(log => log.status === 'success').length;
        const winRate = totalTrades > 0 ? successfulTrades / totalTrades : 0;
        let maxDrawdown = new bignumber_js_1.default(0);
        let peak = new bignumber_js_1.default(0);
        let runningPnL = new bignumber_js_1.default(0);
        for (const log of this.tradeLogs) {
            if (log.profit) {
                runningPnL = runningPnL.plus(log.profit);
                peak = bignumber_js_1.default.max(peak, runningPnL);
                const drawdown = peak.minus(runningPnL);
                maxDrawdown = bignumber_js_1.default.max(maxDrawdown, drawdown);
            }
        }
        const sharpeRatio = this.returns.length > 1
            ? math_1.MathUtils.calculateSharpeRatio(this.returns)
            : new bignumber_js_1.default(0);
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
    assessCurrentRiskLevel() {
        const exposureRatio = this.currentExposure.dividedBy(this.riskLimits.maxPositionSize);
        const dailyLossRatio = this.dailyPnL.negated().dividedBy(this.riskLimits.maxDailyLoss);
        if (exposureRatio.isGreaterThan(0.8) || dailyLossRatio.isGreaterThan(0.8)) {
            return 'high';
        }
        else if (exposureRatio.isGreaterThan(0.5) || dailyLossRatio.isGreaterThan(0.5)) {
            return 'medium';
        }
        else {
            return 'low';
        }
    }
    checkDailyReset() {
        const now = Date.now();
        if (now >= this.dailyResetTime) {
            this.resetDailyMetrics();
            this.dailyResetTime = this.getNextDailyReset();
            logger_1.Logger.info('Daily risk metrics reset');
        }
    }
    resetDailyMetrics() {
        this.dailyPnL = new bignumber_js_1.default(0);
        const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        this.tradeLogs = this.tradeLogs.filter(log => log.timestamp > weekAgo);
    }
    getNextDailyReset() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        tomorrow.setUTCHours(0, 0, 0, 0);
        return tomorrow.getTime();
    }
    shouldEmergencyShutdown() {
        const metrics = this.getRiskMetrics();
        const conditions = [
            this.dailyPnL.isLessThan(this.riskLimits.maxDailyLoss.negated()),
            metrics.currentRisk === 'high' && this.dailyPnL.isNegative(),
            metrics.winRate < 0.3 && this.dailyPnL.isLessThan(new bignumber_js_1.default(-1000000000)),
            metrics.maxDrawdown.isGreaterThan(this.riskLimits.maxDailyLoss.multipliedBy(0.5))
        ];
        const shouldShutdown = conditions.some(condition => condition);
        if (shouldShutdown) {
            logger_1.Logger.security('Emergency shutdown triggered', { metrics });
        }
        return shouldShutdown;
    }
    getRiskSummary() {
        const exposureUtilization = this.currentExposure
            .dividedBy(this.riskLimits.maxPositionSize).toNumber();
        const dailyLossUtilization = this.dailyPnL.isNegative()
            ? this.dailyPnL.negated().dividedBy(this.riskLimits.maxDailyLoss).toNumber()
            : 0;
        const recommendations = [];
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
    updateRiskLimits(newLimits) {
        this.riskLimits = { ...this.riskLimits, ...newLimits };
        logger_1.Logger.info('Risk limits updated', { newLimits });
    }
    getPerformanceHistory(days = 7) {
        const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
        const recentLogs = this.tradeLogs.filter(log => log.timestamp > cutoffTime);
        const dailyData = new Map();
        for (const log of recentLogs) {
            const date = new Date(log.timestamp).toISOString().split('T')[0];
            const profit = log.profit || new bignumber_js_1.default(0);
            const existing = dailyData.get(date) || new bignumber_js_1.default(0);
            dailyData.set(date, existing.plus(profit));
        }
        const dailyReturns = Array.from(dailyData.entries()).map(([date, pnl]) => ({
            date,
            pnl
        }));
        const returns = dailyReturns.map(d => d.pnl);
        const cumulativeReturn = returns.reduce((sum, ret) => sum.plus(ret), new bignumber_js_1.default(0));
        const volatility = math_1.MathUtils.calculateStandardDeviation(returns);
        const maxDrawdown = this.getRiskMetrics().maxDrawdown;
        return {
            dailyReturns,
            cumulativeReturn,
            volatility,
            maxDrawdown
        };
    }
}
exports.RiskManagementService = RiskManagementService;
exports.default = RiskManagementService;
//# sourceMappingURL=risk-management.js.map