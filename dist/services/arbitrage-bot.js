"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArbitrageBotService = void 0;
const bignumber_js_1 = __importDefault(require("bignumber.js"));
const node_cron_1 = __importDefault(require("node-cron"));
const logger_1 = require("../utils/logger");
const deepbook_1 = __importDefault(require("./deepbook"));
const external_data_1 = __importDefault(require("./external-data"));
const risk_management_1 = __importDefault(require("./risk-management"));
const triangular_arbitrage_1 = __importDefault(require("../strategies/triangular-arbitrage"));
const cross_dex_arbitrage_1 = __importDefault(require("../strategies/cross-dex-arbitrage"));
class ArbitrageBotService {
    constructor(config) {
        this.isRunning = false;
        this.startTime = 0;
        this.totalTrades = 0;
        this.successfulTrades = 0;
        this.totalProfit = new bignumber_js_1.default(0);
        this.totalGasCost = new bignumber_js_1.default(0);
        this.executionTimes = [];
        this.config = config;
        this.deepBookService = new deepbook_1.default(config);
        this.externalDataService = new external_data_1.default(config);
        this.riskManagementService = new risk_management_1.default(config);
        this.triangularStrategy = new triangular_arbitrage_1.default(this.deepBookService, config.minProfitThreshold, config.maxSlippage);
        this.crossDexStrategy = new cross_dex_arbitrage_1.default(this.deepBookService, this.externalDataService, config.minProfitThreshold, config.maxSlippage);
    }
    async start() {
        if (this.isRunning) {
            logger_1.Logger.warn("Bot is already running");
            return;
        }
        try {
            logger_1.Logger.info("Starting DeepBook Arbitrage Bot...");
            await this.deepBookService.initialize();
            this.isRunning = true;
            this.startTime = Date.now();
            this.startOpportunityScanning();
            this.startMonitoring();
            this.setupCronJobs();
            logger_1.Logger.info("Arbitrage bot started successfully");
        }
        catch (error) {
            logger_1.Logger.error("Failed to start arbitrage bot", { error });
            this.isRunning = false;
            throw error;
        }
    }
    async stop() {
        logger_1.Logger.info("Stopping arbitrage bot...");
        this.isRunning = false;
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
        }
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        logger_1.Logger.info("Arbitrage bot stopped");
    }
    startOpportunityScanning() {
        this.scanInterval = setInterval(async () => {
            try {
                await this.scanAndExecuteOpportunities();
            }
            catch (error) {
                logger_1.Logger.error("Error in opportunity scanning", { error });
            }
        }, 2000);
    }
    startMonitoring() {
        this.monitoringInterval = setInterval(() => {
            try {
                this.logSystemStatus();
            }
            catch (error) {
                logger_1.Logger.error("Error in system monitoring", { error });
            }
        }, 30000);
    }
    setupCronJobs() {
        node_cron_1.default.schedule("* * * * *", async () => {
            try {
                await this.deepBookService.refreshData();
            }
            catch (error) {
                logger_1.Logger.error("Error refreshing market data", { error });
            }
        });
        node_cron_1.default.schedule("0 * * * *", () => {
            try {
                this.logHourlySummary();
            }
            catch (error) {
                logger_1.Logger.error("Error in hourly summary", { error });
            }
        });
        node_cron_1.default.schedule("*/5 * * * *", () => {
            try {
                this.performRiskAssessment();
            }
            catch (error) {
                logger_1.Logger.error("Error in risk assessment", { error });
            }
        });
    }
    async scanAndExecuteOpportunities() {
        if (!this.isRunning)
            return;
        if (this.riskManagementService.shouldEmergencyShutdown()) {
            logger_1.Logger.security("Emergency shutdown initiated by risk management");
            await this.stop();
            return;
        }
        const opportunities = [];
        if (this.config.strategies.triangularArbitrage &&
            this.triangularStrategy.enabled) {
            try {
                const triangularOps = await this.triangularStrategy.scanOpportunities();
                opportunities.push(...triangularOps);
            }
            catch (error) {
                logger_1.Logger.error("Error scanning triangular arbitrage", { error });
            }
        }
        if (this.config.strategies.crossDexArbitrage &&
            this.crossDexStrategy.enabled) {
            try {
                const crossDexOps = await this.crossDexStrategy.scanOpportunities();
                opportunities.push(...crossDexOps);
            }
            catch (error) {
                logger_1.Logger.error("Error scanning cross-DEX arbitrage", { error });
            }
        }
        if (opportunities.length === 0) {
            return;
        }
        opportunities.sort((a, b) => {
            const profitDiff = b.profitPercentage.minus(a.profitPercentage);
            if (!profitDiff.isZero()) {
                return profitDiff.isPositive() ? 1 : -1;
            }
            return b.confidence - a.confidence;
        });
        logger_1.Logger.info(`Found ${opportunities.length} arbitrage opportunities`);
        for (const opportunity of opportunities.slice(0, 3)) {
            try {
                await this.executeOpportunity(opportunity);
            }
            catch (error) {
                logger_1.Logger.error("Error executing opportunity", {
                    opportunityId: opportunity.id,
                    error,
                });
            }
        }
    }
    async executeOpportunity(opportunity) {
        const riskEvaluation = await this.riskManagementService.evaluateOpportunity(opportunity);
        if (!riskEvaluation.approved) {
            logger_1.Logger.risk("Opportunity rejected by risk management", {
                opportunityId: opportunity.id,
                reason: riskEvaluation.reason,
            });
            return;
        }
        if (riskEvaluation.adjustedAmount) {
            opportunity.tradeAmount = riskEvaluation.adjustedAmount;
            logger_1.Logger.info("Trade amount adjusted by risk management", {
                opportunityId: opportunity.id,
                adjustedAmount: riskEvaluation.adjustedAmount.toString(),
            });
        }
        const tradeLog = {
            id: `trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            strategy: opportunity.type,
            type: "flash-loan",
            status: "pending",
        };
        this.riskManagementService.recordTrade(tradeLog);
        this.totalTrades++;
        try {
            const result = await this.executeStrategy(opportunity);
            tradeLog.status = result.success ? "success" : "failed";
            tradeLog.txHash = result.txHash;
            tradeLog.profit = result.actualProfit;
            tradeLog.gasCost = result.gasCost;
            tradeLog.error = result.error;
            tradeLog.executionTime = result.executionTime;
            this.riskManagementService.recordTrade(tradeLog);
            if (result.success) {
                this.successfulTrades++;
                if (result.actualProfit) {
                    this.totalProfit = this.totalProfit.plus(result.actualProfit);
                }
                if (result.gasCost) {
                    this.totalGasCost = this.totalGasCost.plus(result.gasCost);
                }
                logger_1.Logger.profit("Arbitrage opportunity executed successfully", {
                    opportunityId: opportunity.id,
                    profit: result.actualProfit?.toString(),
                    txHash: result.txHash,
                });
            }
            else {
                logger_1.Logger.error("Arbitrage opportunity execution failed", {
                    opportunityId: opportunity.id,
                    error: result.error,
                });
            }
            this.executionTimes.push(result.executionTime);
            if (this.executionTimes.length > 100) {
                this.executionTimes = this.executionTimes.slice(-50);
            }
        }
        catch (error) {
            tradeLog.status = "failed";
            tradeLog.error = error instanceof Error ? error.message : "Unknown error";
            this.riskManagementService.recordTrade(tradeLog);
            logger_1.Logger.error("Unexpected error executing opportunity", {
                opportunityId: opportunity.id,
                error,
            });
        }
    }
    async executeStrategy(opportunity) {
        switch (opportunity.type) {
            case "triangular":
                return await this.triangularStrategy.execute(opportunity);
            case "cross-dex":
                return await this.crossDexStrategy.execute(opportunity);
            default:
                throw new Error(`Unknown opportunity type: ${opportunity.type}`);
        }
    }
    performRiskAssessment() {
        const riskSummary = this.riskManagementService.getRiskSummary();
        if (riskSummary.currentRisk === "high") {
            logger_1.Logger.risk("High risk level detected", { riskSummary });
        }
        if (riskSummary.recommendations.length > 0) {
            logger_1.Logger.risk("Risk management recommendations", {
                recommendations: riskSummary.recommendations,
            });
        }
    }
    logSystemStatus() {
        const metrics = this.getSystemMetrics();
        logger_1.Logger.info("System Status", {
            uptime: metrics.uptime,
            totalTrades: metrics.totalTrades,
            successRate: `${((metrics.successfulTrades / Math.max(metrics.totalTrades, 1)) *
                100).toFixed(2)}%`,
            totalProfit: metrics.totalProfit.toString(),
            avgExecutionTime: `${metrics.avgExecutionTime.toFixed(0)}ms`,
        });
    }
    logHourlySummary() {
        const metrics = this.getSystemMetrics();
        const riskMetrics = this.riskManagementService.getRiskMetrics();
        logger_1.Logger.info("Hourly Summary", {
            totalTrades: metrics.totalTrades,
            successfulTrades: metrics.successfulTrades,
            totalProfit: metrics.totalProfit.toString(),
            totalGasCost: metrics.totalGasCost.toString(),
            netProfit: metrics.totalProfit.minus(metrics.totalGasCost).toString(),
            winRate: riskMetrics.winRate,
            currentRisk: riskMetrics.currentRisk,
        });
    }
    getSystemMetrics() {
        const uptime = this.isRunning ? Date.now() - this.startTime : 0;
        const avgExecutionTime = this.executionTimes.length > 0
            ? this.executionTimes.reduce((sum, time) => sum + time, 0) /
                this.executionTimes.length
            : 0;
        const memoryUsage = process.memoryUsage();
        const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
        return {
            uptime,
            totalTrades: this.totalTrades,
            successfulTrades: this.successfulTrades,
            totalProfit: this.totalProfit,
            totalGasCost: this.totalGasCost,
            avgExecutionTime,
            currentBalance: new bignumber_js_1.default(0),
            memoryUsage: memoryUsagePercent,
            cpuUsage: 0,
        };
    }
    getStatus() {
        return {
            isRunning: this.isRunning,
            uptime: this.isRunning ? Date.now() - this.startTime : 0,
            strategies: {
                triangularArbitrage: this.triangularStrategy.enabled,
                crossDexArbitrage: this.crossDexStrategy.enabled,
            },
            lastScan: Date.now(),
        };
    }
    updateStrategy(strategy, settings) {
        switch (strategy) {
            case "triangular":
                if (settings.enabled !== undefined) {
                    this.triangularStrategy.enabled = settings.enabled;
                }
                if (settings.minProfitThreshold) {
                    this.triangularStrategy.minProfitThreshold =
                        settings.minProfitThreshold;
                }
                if (settings.maxSlippage) {
                    this.triangularStrategy.maxSlippage = settings.maxSlippage;
                }
                break;
            case "crossDex":
                if (settings.enabled !== undefined) {
                    this.crossDexStrategy.enabled = settings.enabled;
                }
                if (settings.minProfitThreshold) {
                    this.crossDexStrategy.minProfitThreshold =
                        settings.minProfitThreshold;
                }
                if (settings.maxSlippage) {
                    this.crossDexStrategy.maxSlippage = settings.maxSlippage;
                }
                break;
        }
        logger_1.Logger.info("Strategy settings updated", { strategy, settings });
    }
    getDeepBookService() {
        return this.deepBookService;
    }
}
exports.ArbitrageBotService = ArbitrageBotService;
exports.default = ArbitrageBotService;
//# sourceMappingURL=arbitrage-bot.js.map