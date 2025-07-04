import BigNumber from "bignumber.js";
import cron from "node-cron";
import { Logger } from "../utils/logger";
import {
  BotConfig,
  FlashLoanOpportunity,
  TradeLog,
  SystemMetrics,
} from "../types/index";
import DeepBookService from "./deepbook";
import ExternalDataService from "./external-data";
import RiskManagementService from "./risk-management";
import TriangularArbitrageStrategy from "../strategies/triangular-arbitrage";
import CrossDexArbitrageStrategy from "../strategies/cross-dex-arbitrage";

/**
 * Main Arbitrage Bot Service
 *
 * Orchestrates all arbitrage strategies and manages the trading lifecycle
 */
export class ArbitrageBotService {
  private config: BotConfig;
  private deepBookService: DeepBookService;
  private externalDataService: ExternalDataService;
  private riskManagementService: RiskManagementService;
  private triangularStrategy: TriangularArbitrageStrategy;
  private crossDexStrategy: CrossDexArbitrageStrategy;

  private isRunning: boolean = false;
  private startTime: number = 0;
  private totalTrades: number = 0;
  private successfulTrades: number = 0;
  private totalProfit: BigNumber = new BigNumber(0);
  private totalGasCost: BigNumber = new BigNumber(0);
  private executionTimes: number[] = [];

  private scanInterval?: NodeJS.Timeout;
  private monitoringInterval?: NodeJS.Timeout;

  constructor(config: BotConfig) {
    this.config = config;

    // Initialize services
    this.deepBookService = new DeepBookService(config);
    this.externalDataService = new ExternalDataService(config);
    this.riskManagementService = new RiskManagementService(config);

    // Initialize strategies
    this.triangularStrategy = new TriangularArbitrageStrategy(
      this.deepBookService,
      config.minProfitThreshold,
      config.maxSlippage
    );

    this.crossDexStrategy = new CrossDexArbitrageStrategy(
      this.deepBookService,
      this.externalDataService,
      config.minProfitThreshold,
      config.maxSlippage
    );
  }

  /**
   * Initialize and start the arbitrage bot
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      Logger.warn("Bot is already running");
      return;
    }

    try {
      Logger.info("Starting DeepBook Arbitrage Bot...");

      // Initialize services
      await this.deepBookService.initialize();

      this.isRunning = true;
      this.startTime = Date.now();

      // Start opportunity scanning
      this.startOpportunityScanning();

      // Start monitoring
      this.startMonitoring();

      // Setup cron jobs for periodic tasks
      this.setupCronJobs();

      Logger.info("Arbitrage bot started successfully");
    } catch (error) {
      Logger.error("Failed to start arbitrage bot", { error });
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the arbitrage bot
   */
  async stop(): Promise<void> {
    Logger.info("Stopping arbitrage bot...");

    this.isRunning = false;

    // Clear intervals
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
    }

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    Logger.info("Arbitrage bot stopped");
  }

  /**
   * Start opportunity scanning
   */
  private startOpportunityScanning(): void {
    this.scanInterval = setInterval(async () => {
      try {
        await this.scanAndExecuteOpportunities();
      } catch (error) {
        Logger.error("Error in opportunity scanning", { error });
      }
    }, 2000); // Scan every 2 seconds
  }

  /**
   * Start system monitoring
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      try {
        this.logSystemStatus();
      } catch (error) {
        Logger.error("Error in system monitoring", { error });
      }
    }, 30000); // Monitor every 30 seconds
  }

  /**
   * Setup cron jobs for periodic tasks
   */
  private setupCronJobs(): void {
    // Refresh market data every minute
    cron.schedule("* * * * *", async () => {
      try {
        await this.deepBookService.refreshData();
      } catch (error) {
        Logger.error("Error refreshing market data", { error });
      }
    });

    // Clean up and log summary every hour
    cron.schedule("0 * * * *", () => {
      try {
        this.logHourlySummary();
      } catch (error) {
        Logger.error("Error in hourly summary", { error });
      }
    });

    // Risk assessment every 5 minutes
    cron.schedule("*/5 * * * *", () => {
      try {
        this.performRiskAssessment();
      } catch (error) {
        Logger.error("Error in risk assessment", { error });
      }
    });
  }

  /**
   * Scan for and execute arbitrage opportunities
   */
  private async scanAndExecuteOpportunities(): Promise<void> {
    if (!this.isRunning) return;

    // Check emergency shutdown conditions
    if (this.riskManagementService.shouldEmergencyShutdown()) {
      Logger.security("Emergency shutdown initiated by risk management");
      await this.stop();
      return;
    }

    const opportunities: FlashLoanOpportunity[] = [];

    // Scan triangular arbitrage opportunities
    if (
      this.config.strategies.triangularArbitrage &&
      this.triangularStrategy.enabled
    ) {
      try {
        const triangularOps = await this.triangularStrategy.scanOpportunities();
        opportunities.push(...triangularOps);
      } catch (error) {
        Logger.error("Error scanning triangular arbitrage", { error });
      }
    }

    // Scan cross-DEX arbitrage opportunities
    if (
      this.config.strategies.crossDexArbitrage &&
      this.crossDexStrategy.enabled
    ) {
      try {
        const crossDexOps = await this.crossDexStrategy.scanOpportunities();
        opportunities.push(...crossDexOps);
      } catch (error) {
        Logger.error("Error scanning cross-DEX arbitrage", { error });
      }
    }

    if (opportunities.length === 0) {
      return;
    }

    // Sort by profit percentage and confidence
    opportunities.sort((a, b) => {
      const profitDiff = b.profitPercentage.minus(a.profitPercentage);
      if (!profitDiff.isZero()) {
        return profitDiff.isPositive() ? 1 : -1;
      }
      return b.confidence - a.confidence;
    });

    Logger.info(`Found ${opportunities.length} arbitrage opportunities`);

    // Execute the best opportunities
    for (const opportunity of opportunities.slice(0, 3)) {
      // Limit to top 3
      try {
        await this.executeOpportunity(opportunity);
      } catch (error) {
        Logger.error("Error executing opportunity", {
          opportunityId: opportunity.id,
          error,
        });
      }
    }
  }

  /**
   * Execute a single arbitrage opportunity
   */
  private async executeOpportunity(
    opportunity: FlashLoanOpportunity
  ): Promise<void> {
    // Risk evaluation
    const riskEvaluation = await this.riskManagementService.evaluateOpportunity(
      opportunity
    );

    if (!riskEvaluation.approved) {
      Logger.risk("Opportunity rejected by risk management", {
        opportunityId: opportunity.id,
        reason: riskEvaluation.reason,
      });
      return;
    }

    // Adjust amount if necessary
    if (riskEvaluation.adjustedAmount) {
      opportunity.tradeAmount = riskEvaluation.adjustedAmount;
      Logger.info("Trade amount adjusted by risk management", {
        opportunityId: opportunity.id,
        adjustedAmount: riskEvaluation.adjustedAmount.toString(),
      });
    }

    // Record trade start
    const tradeLog: TradeLog = {
      id: `trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      strategy: opportunity.type,
      type: "flash-loan",
      status: "pending",
    };

    this.riskManagementService.recordTrade(tradeLog);
    this.totalTrades++;

    try {
      // Execute the opportunity
      const result = await this.executeStrategy(opportunity);

      // Update trade log
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

        Logger.profit("Arbitrage opportunity executed successfully", {
          opportunityId: opportunity.id,
          profit: result.actualProfit?.toString(),
          txHash: result.txHash,
        });
      } else {
        Logger.error("Arbitrage opportunity execution failed", {
          opportunityId: opportunity.id,
          error: result.error,
        });
      }

      this.executionTimes.push(result.executionTime);
      if (this.executionTimes.length > 100) {
        this.executionTimes = this.executionTimes.slice(-50);
      }
    } catch (error) {
      tradeLog.status = "failed";
      tradeLog.error = error instanceof Error ? error.message : "Unknown error";
      this.riskManagementService.recordTrade(tradeLog);

      Logger.error("Unexpected error executing opportunity", {
        opportunityId: opportunity.id,
        error,
      });
    }
  }

  /**
   * Execute strategy based on opportunity type
   */
  private async executeStrategy(opportunity: FlashLoanOpportunity) {
    switch (opportunity.type) {
      case "triangular":
        return await this.triangularStrategy.execute(opportunity);
      case "cross-dex":
        return await this.crossDexStrategy.execute(opportunity);
      default:
        throw new Error(`Unknown opportunity type: ${opportunity.type}`);
    }
  }

  /**
   * Perform risk assessment
   */
  private performRiskAssessment(): void {
    const riskSummary = this.riskManagementService.getRiskSummary();

    if (riskSummary.currentRisk === "high") {
      Logger.risk("High risk level detected", { riskSummary });
    }

    if (riskSummary.recommendations.length > 0) {
      Logger.risk("Risk management recommendations", {
        recommendations: riskSummary.recommendations,
      });
    }
  }

  /**
   * Log system status
   */
  private logSystemStatus(): void {
    const metrics = this.getSystemMetrics();

    Logger.info("System Status", {
      uptime: metrics.uptime,
      totalTrades: metrics.totalTrades,
      successRate: `${(
        (metrics.successfulTrades / Math.max(metrics.totalTrades, 1)) *
        100
      ).toFixed(2)}%`,
      totalProfit: metrics.totalProfit.toString(),
      avgExecutionTime: `${metrics.avgExecutionTime.toFixed(0)}ms`,
    });
  }

  /**
   * Log hourly summary
   */
  private logHourlySummary(): void {
    const metrics = this.getSystemMetrics();
    const riskMetrics = this.riskManagementService.getRiskMetrics();

    Logger.info("Hourly Summary", {
      totalTrades: metrics.totalTrades,
      successfulTrades: metrics.successfulTrades,
      totalProfit: metrics.totalProfit.toString(),
      totalGasCost: metrics.totalGasCost.toString(),
      netProfit: metrics.totalProfit.minus(metrics.totalGasCost).toString(),
      winRate: riskMetrics.winRate,
      currentRisk: riskMetrics.currentRisk,
    });
  }

  /**
   * Get system metrics
   */
  getSystemMetrics(): SystemMetrics {
    const uptime = this.isRunning ? Date.now() - this.startTime : 0;
    const avgExecutionTime =
      this.executionTimes.length > 0
        ? this.executionTimes.reduce((sum, time) => sum + time, 0) /
          this.executionTimes.length
        : 0;

    // Get memory usage
    const memoryUsage = process.memoryUsage();
    const memoryUsagePercent =
      (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

    return {
      uptime,
      totalTrades: this.totalTrades,
      successfulTrades: this.successfulTrades,
      totalProfit: this.totalProfit,
      totalGasCost: this.totalGasCost,
      avgExecutionTime,
      currentBalance: new BigNumber(0), // Would get from wallet
      memoryUsage: memoryUsagePercent,
      cpuUsage: 0, // Would implement CPU monitoring
    };
  }

  /**
   * Get bot status
   */
  getStatus(): {
    isRunning: boolean;
    uptime: number;
    strategies: { [key: string]: boolean };
    lastScan: number;
  } {
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

  /**
   * Update strategy settings
   */
  updateStrategy(
    strategy: "triangular" | "crossDex",
    settings: {
      enabled?: boolean;
      minProfitThreshold?: BigNumber;
      maxSlippage?: BigNumber;
    }
  ): void {
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

    Logger.info("Strategy settings updated", { strategy, settings });
  }

  /**
   * Get DeepBook service instance for dashboard access
   */
  getDeepBookService(): DeepBookService {
    return this.deepBookService;
  }
}

export default ArbitrageBotService;
