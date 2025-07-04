"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrossDexArbitrageStrategy = void 0;
const bignumber_js_1 = __importDefault(require("bignumber.js"));
const logger_1 = require("../utils/logger");
const math_1 = require("../utils/math");
class CrossDexArbitrageStrategy {
    constructor(deepBookService, externalDataService, minProfitThreshold, maxSlippage) {
        this.name = "Cross-DEX Arbitrage";
        this.enabled = true;
        this.priority = 2;
        this.riskLevel = "low";
        this.monitoredPairs = [];
        this.deepBookService = deepBookService;
        this.externalDataService = externalDataService;
        this.minProfitThreshold = minProfitThreshold;
        this.maxSlippage = maxSlippage;
        this.initializeMonitoredPairs();
    }
    initializeMonitoredPairs() {
        const pairMappings = [
            {
                deepbookSymbol: "SUI_USDC",
                externalSymbol: "SUIUSDT",
                baseAsset: "SUI",
                quoteAsset: "USDC",
                conversionRequired: true,
                priority: 1,
            },
            {
                deepbookSymbol: "SUI_USDC",
                externalSymbol: "SUIUSDC",
                baseAsset: "SUI",
                quoteAsset: "USDC",
                conversionRequired: false,
                priority: 2,
            }
        ];
        this.monitoredPairs = pairMappings
            .filter((mapping) => mapping.externalSymbol !== null)
            .map((mapping) => ({
            deepbookPair: this.deepBookService.getTradingPair(mapping.deepbookSymbol),
            externalSymbol: mapping.externalSymbol,
            baseAsset: mapping.baseAsset,
            quoteAsset: mapping.quoteAsset,
            conversionRequired: mapping.conversionRequired,
            priority: mapping.priority,
            lastPriceCheck: 0,
            priceDiscrepancy: new bignumber_js_1.default(0),
        }))
            .filter((pair) => pair.deepbookPair !== null);
        logger_1.Logger.info(`Initialized ${this.monitoredPairs.length} SUI/USDC cross-DEX arbitrage pairs for profitable trading`);
    }
    async scanOpportunities() {
        const opportunities = [];
        for (const monitoredPair of this.monitoredPairs) {
            try {
                const opportunity = await this.analyzeCrossDexPair(monitoredPair);
                if (opportunity) {
                    if (opportunity.expectedProfit &&
                        opportunity.expectedProfit.isGreaterThanOrEqualTo(0.05)) {
                        opportunities.push(opportunity);
                        logger_1.Logger.arbitrage(`Profitable SUI/USDC opportunity: ${opportunity.expectedProfit.toFixed(4)} USDC profit`, {
                            strategy: 'cross-dex',
                            pair: monitoredPair.baseAsset + '/' + monitoredPair.quoteAsset,
                            type: opportunity.type
                        });
                    }
                    else if (opportunity.expectedProfit && opportunity.expectedProfit.isGreaterThan(0)) {
                        logger_1.Logger.info(`Small opportunity found but profit (${opportunity.expectedProfit.toFixed(4)}) < 0.05 USDC minimum, monitoring for better conditions.`);
                    }
                }
            }
            catch (error) {
                logger_1.Logger.error(`Error analyzing SUI/USDC cross-DEX pair`, { error });
            }
        }
        opportunities.sort((a, b) => b.expectedProfit.minus(a.expectedProfit).toNumber());
        return opportunities;
    }
    async analyzeCrossDexPair(monitoredPair) {
        if (!monitoredPair.deepbookPair)
            return null;
        const deepbookPrice = this.deepBookService.getPrice(monitoredPair.deepbookPair.symbol);
        const externalPrice = await this.externalDataService.getPrice(monitoredPair.externalSymbol);
        if (!deepbookPrice || !externalPrice) {
            return null;
        }
        let effectiveExternalPrice = externalPrice.price;
        if (monitoredPair.conversionRequired) {
            const conversionRate = await this.getConversionRate("USDT", "USDC");
            if (!conversionRate)
                return null;
            effectiveExternalPrice =
                effectiveExternalPrice.multipliedBy(conversionRate);
        }
        const priceDifference = deepbookPrice.price.minus(effectiveExternalPrice);
        const priceDiscrepancyPercent = priceDifference
            .dividedBy(effectiveExternalPrice)
            .abs();
        monitoredPair.priceDiscrepancy = priceDiscrepancyPercent;
        monitoredPair.lastPriceCheck = Date.now();
        if (priceDiscrepancyPercent.isLessThan(this.minProfitThreshold)) {
            return null;
        }
        const shouldBuyOnDeepbook = deepbookPrice.price.isLessThan(effectiveExternalPrice);
        const direction = shouldBuyOnDeepbook ? "buy-deepbook" : "sell-deepbook";
        const optimalAmount = this.calculateOptimalTradeAmount(monitoredPair, deepbookPrice.price, effectiveExternalPrice, direction);
        if (optimalAmount.isLessThanOrEqualTo(0)) {
            return null;
        }
        const expectedProfit = this.calculateExpectedProfit(optimalAmount, deepbookPrice.price, effectiveExternalPrice, direction);
        const gasEstimate = this.estimateGasCost();
        if (!math_1.MathUtils.isProfitableAfterGas(expectedProfit, gasEstimate, this.minProfitThreshold.multipliedBy(optimalAmount))) {
            return null;
        }
        const opportunity = {
            id: this.generateOpportunityId(monitoredPair, direction),
            type: "cross-dex",
            strategy: 'Cross-DEX Arbitrage',
            asset: monitoredPair.baseAsset,
            amount: optimalAmount,
            pools: [monitoredPair.deepbookPair],
            path: [monitoredPair.baseAsset, monitoredPair.quoteAsset],
            expectedProfit,
            profitPercentage: priceDiscrepancyPercent,
            tradeAmount: optimalAmount,
            gasEstimate,
            estimatedGas: gasEstimate,
            confidence: new bignumber_js_1.default(this.calculateConfidence(priceDiscrepancyPercent, externalPrice.volume24h)),
            maxSlippage: this.maxSlippage,
            deadline: Date.now() + 30000,
            timestamp: Date.now(),
        };
        logger_1.Logger.arbitrage("Cross-DEX arbitrage opportunity found", {
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
    calculateOptimalTradeAmount(monitoredPair, deepbookPrice, externalPrice, direction) {
        const availableLiquidity = this.getAvailableLiquidity(monitoredPair);
        const maxProfitableAmount = this.calculateMaxProfitableAmount(deepbookPrice, externalPrice, direction);
        return bignumber_js_1.default.min(availableLiquidity, maxProfitableAmount);
    }
    getAvailableLiquidity(monitoredPair) {
        if (!monitoredPair.deepbookPair)
            return new bignumber_js_1.default(0);
        const price = this.deepBookService.getPrice(monitoredPair.deepbookPair.symbol);
        if (!price)
            return new bignumber_js_1.default(0);
        return price.volume24h.multipliedBy(0.1);
    }
    calculateMaxProfitableAmount(deepbookPrice, externalPrice, direction) {
        const baseLiquidity = new bignumber_js_1.default(10000000000);
        const priceDiff = deepbookPrice.minus(externalPrice).abs();
        const relativeDiff = priceDiff.dividedBy(externalPrice);
        return baseLiquidity.multipliedBy(relativeDiff.multipliedBy(100).plus(1));
    }
    calculateExpectedProfit(amount, deepbookPrice, externalPrice, direction) {
        let profit;
        if (direction === "buy-deepbook") {
            const buyValue = amount.multipliedBy(deepbookPrice);
            const sellValue = amount.multipliedBy(externalPrice);
            profit = sellValue.minus(buyValue);
        }
        else {
            const buyValue = amount.multipliedBy(externalPrice);
            const sellValue = amount.multipliedBy(deepbookPrice);
            profit = sellValue.minus(buyValue);
        }
        const tradingFees = amount.multipliedBy(0.005);
        return profit.minus(tradingFees);
    }
    async getConversionRate(fromAsset, toAsset) {
        try {
            if ((fromAsset === "USDT" && toAsset === "USDC") ||
                (fromAsset === "USDC" && toAsset === "USDT")) {
                return new bignumber_js_1.default(1);
            }
            return new bignumber_js_1.default(1);
        }
        catch (error) {
            logger_1.Logger.error("Error getting conversion rate", {
                fromAsset,
                toAsset,
                error,
            });
            return null;
        }
    }
    estimateGasCost() {
        return new bignumber_js_1.default(80000000);
    }
    calculateConfidence(priceDiscrepancy, externalVolume) {
        let confidence = 0.3;
        const discrepancyBonus = Math.min(priceDiscrepancy.toNumber() * 20, 0.4);
        confidence += discrepancyBonus;
        const volumeBonus = Math.min(externalVolume.toNumber() / 1000000, 0.2);
        confidence += volumeBonus;
        return Math.min(confidence, 0.85);
    }
    generateOpportunityId(monitoredPair, direction) {
        const pairStr = monitoredPair.externalSymbol.replace("/", "-");
        const timestamp = Date.now();
        return `cross-dex-${pairStr}-${direction}-${timestamp}`;
    }
    async execute(opportunity) {
        logger_1.Logger.arbitrage("Executing cross-DEX arbitrage", {
            opportunityId: opportunity.id,
            expectedProfit: opportunity.expectedProfit.toString(),
        });
        try {
            return await this.deepBookService.executeFlashLoanArbitrage(opportunity);
        }
        catch (error) {
            logger_1.Logger.error("Cross-DEX arbitrage execution failed", {
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
    getStatistics() {
        const activePairs = this.monitoredPairs.filter((pair) => pair.priceDiscrepancy.isGreaterThan(0));
        const totalDiscrepancy = this.monitoredPairs.reduce((sum, pair) => sum.plus(pair.priceDiscrepancy), new bignumber_js_1.default(0));
        const avgDiscrepancy = this.monitoredPairs.length > 0
            ? totalDiscrepancy.dividedBy(this.monitoredPairs.length)
            : new bignumber_js_1.default(0);
        const lastUpdate = Math.max(...this.monitoredPairs.map((pair) => pair.lastPriceCheck));
        return {
            totalPairs: this.monitoredPairs.length,
            activePairs: activePairs.length,
            avgDiscrepancy,
            lastUpdate,
        };
    }
}
exports.CrossDexArbitrageStrategy = CrossDexArbitrageStrategy;
exports.default = CrossDexArbitrageStrategy;
//# sourceMappingURL=cross-dex-arbitrage.js.map