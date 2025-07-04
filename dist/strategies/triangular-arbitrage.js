"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TriangularArbitrageStrategy = void 0;
const bignumber_js_1 = __importDefault(require("bignumber.js"));
const logger_1 = require("../utils/logger");
const math_1 = require("../utils/math");
class TriangularArbitrageStrategy {
    constructor(deepBookService, minProfitThreshold, maxSlippage) {
        this.name = 'Triangular Arbitrage';
        this.enabled = true;
        this.priority = 1;
        this.riskLevel = 'medium';
        this.triangularPaths = [];
        this.deepBookService = deepBookService;
        this.minProfitThreshold = minProfitThreshold;
        this.maxSlippage = maxSlippage;
        this.initializeTriangularPaths();
    }
    initializeTriangularPaths() {
        const commonPaths = [
            ['SUI', 'USDC', 'DEEP'],
            ['SUI', 'USDC', 'WETH'],
            ['SUI', 'USDC', 'WBTC'],
            ['SUI', 'DEEP', 'USDC'],
            ['USDC', 'WETH', 'SUI'],
            ['USDC', 'WBTC', 'SUI'],
            ['USDC', 'DEEP', 'SUI'],
            ['USDC', 'WUSDT', 'WUSDC'],
            ['DEEP', 'SUI', 'USDC'],
            ['DEEP', 'USDC', 'SUI'],
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
        this.triangularPaths.sort((a, b) => b.priority - a.priority);
        logger_1.Logger.info(`Initialized ${this.triangularPaths.length} triangular arbitrage paths`);
    }
    buildTradingPairsFromPath(assetPath) {
        const pairs = [];
        for (let i = 0; i < assetPath.length; i++) {
            const baseAsset = assetPath[i];
            const quoteAsset = assetPath[(i + 1) % assetPath.length];
            let pair = this.findTradingPair(baseAsset, quoteAsset);
            if (!pair) {
                pair = this.findTradingPair(quoteAsset, baseAsset);
            }
            if (pair) {
                pairs.push(pair);
            }
            else {
                return [];
            }
        }
        return pairs;
    }
    findTradingPair(base, quote) {
        const pairs = this.deepBookService.getAllTradingPairs();
        return pairs.find(pair => (pair.base === base && pair.quote === quote) ||
            (pair.base === quote && pair.quote === base)) || null;
    }
    calculatePathPriority(pairs) {
        let priority = 0;
        for (const pair of pairs) {
            const price = this.deepBookService.getPrice(pair.symbol);
            if (price) {
                priority += price.volume24h.toNumber();
            }
        }
        return priority;
    }
    async scanOpportunities() {
        const opportunities = [];
        for (const path of this.triangularPaths) {
            try {
                const opportunity = await this.analyzeTriangularPath(path);
                if (opportunity) {
                    opportunities.push(opportunity);
                }
            }
            catch (error) {
                logger_1.Logger.error(`Error analyzing triangular path ${path.assets.join(' -> ')}`, { error });
            }
        }
        opportunities.sort((a, b) => {
            const result = b.profitPercentage.comparedTo(a.profitPercentage);
            return result === null ? 0 : result;
        });
        return opportunities;
    }
    async analyzeTriangularPath(path) {
        const { pairs, assets } = path;
        if (pairs.length !== 3) {
            return null;
        }
        const prices = pairs.map(pair => this.deepBookService.getPrice(pair.symbol));
        if (prices.some(price => !price)) {
            return null;
        }
        const startAmount = new bignumber_js_1.default(1000000000);
        const result = this.calculateTriangularArbitrage(pairs, prices, startAmount);
        if (!result || result.profitPercentage.isLessThan(this.minProfitThreshold)) {
            return null;
        }
        const optimalResult = this.findOptimalTradeAmount(pairs, prices);
        if (!optimalResult || optimalResult.profit.isLessThanOrEqualTo(0)) {
            return null;
        }
        const gasEstimate = this.estimateGasCost(pairs.length);
        if (!math_1.MathUtils.isProfitableAfterGas(optimalResult.profit, gasEstimate, this.minProfitThreshold.multipliedBy(optimalResult.amount))) {
            return null;
        }
        const opportunity = {
            id: this.generateOpportunityId(path),
            type: 'triangular',
            pools: pairs,
            path: assets,
            expectedProfit: optimalResult.profit,
            profitPercentage: result.profitPercentage,
            tradeAmount: optimalResult.amount,
            gasEstimate,
            confidence: new bignumber_js_1.default(this.calculateConfidence(pairs, result.profitPercentage)),
            timestamp: Date.now()
        };
        logger_1.Logger.arbitrage('Triangular arbitrage opportunity found', {
            path: assets.join(' -> '),
            profitPercentage: result.profitPercentage.toString(),
            expectedProfit: optimalResult.profit.toString(),
            tradeAmount: optimalResult.amount.toString()
        });
        return opportunity;
    }
    calculateTriangularArbitrage(pairs, prices, startAmount) {
        try {
            let currentAmount = startAmount;
            for (let i = 0; i < pairs.length; i++) {
                const pair = pairs[i];
                const price = prices[i];
                if (!price)
                    return null;
                const slippage = this.calculateSlippage(currentAmount, pair);
                const fee = this.calculateTradingFee(currentAmount);
                currentAmount = currentAmount
                    .multipliedBy(price.price)
                    .multipliedBy(new bignumber_js_1.default(1).minus(slippage))
                    .multipliedBy(new bignumber_js_1.default(1).minus(fee));
            }
            const profit = currentAmount.minus(startAmount);
            const profitPercentage = profit.dividedBy(startAmount);
            return { profit, profitPercentage, endAmount: currentAmount };
        }
        catch (error) {
            logger_1.Logger.error('Error calculating triangular arbitrage', { error });
            return null;
        }
    }
    findOptimalTradeAmount(pairs, prices) {
        const minAmount = new bignumber_js_1.default(100000000);
        const maxAmount = new bignumber_js_1.default(100000000000);
        const profitFunction = (amount) => {
            const result = this.calculateTriangularArbitrage(pairs, prices, amount);
            return result ? result.profit : new bignumber_js_1.default(0);
        };
        return math_1.MathUtils.findOptimalTradeAmount(minAmount, maxAmount, profitFunction);
    }
    calculateSlippage(tradeAmount, pair) {
        const baseSlippage = new bignumber_js_1.default(0.001);
        const liquidityFactor = tradeAmount.dividedBy(new bignumber_js_1.default(1000000000000));
        return baseSlippage.multipliedBy(new bignumber_js_1.default(1).plus(liquidityFactor));
    }
    calculateTradingFee(amount) {
        return new bignumber_js_1.default(0.0025);
    }
    estimateGasCost(numberOfPairs) {
        const baseGas = new bignumber_js_1.default(50000000);
        const perPairGas = new bignumber_js_1.default(20000000);
        return baseGas.plus(perPairGas.multipliedBy(numberOfPairs));
    }
    calculateConfidence(pairs, profitPercentage) {
        let confidence = 0.5;
        const profitBonus = Math.min(profitPercentage.toNumber() * 10, 0.3);
        confidence += profitBonus;
        const liquidityBonus = pairs.length >= 3 ? 0.1 : 0;
        confidence += liquidityBonus;
        return Math.min(confidence, 0.95);
    }
    generateOpportunityId(path) {
        const pathStr = path.assets.join('-');
        const timestamp = Date.now();
        return `triangular-${pathStr}-${timestamp}`;
    }
    async execute(opportunity) {
        logger_1.Logger.arbitrage('Executing triangular arbitrage', {
            opportunityId: opportunity.id,
            path: opportunity.path.join(' -> '),
            expectedProfit: opportunity.expectedProfit.toString()
        });
        try {
            return await this.deepBookService.executeFlashLoanArbitrage(opportunity);
        }
        catch (error) {
            logger_1.Logger.error('Triangular arbitrage execution failed', {
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
exports.TriangularArbitrageStrategy = TriangularArbitrageStrategy;
exports.default = TriangularArbitrageStrategy;
//# sourceMappingURL=triangular-arbitrage.js.map