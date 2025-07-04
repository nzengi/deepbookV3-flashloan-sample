import BigNumber from "bignumber.js";
import { BotConfig, SystemMetrics } from "../types/index";
import DeepBookService from "./deepbook";
export declare class ArbitrageBotService {
    private config;
    private deepBookService;
    private externalDataService;
    private riskManagementService;
    private triangularStrategy;
    private crossDexStrategy;
    private isRunning;
    private startTime;
    private totalTrades;
    private successfulTrades;
    private totalProfit;
    private totalGasCost;
    private executionTimes;
    private scanInterval?;
    private monitoringInterval?;
    constructor(config: BotConfig);
    start(): Promise<void>;
    stop(): Promise<void>;
    private startOpportunityScanning;
    private startMonitoring;
    private setupCronJobs;
    private scanAndExecuteOpportunities;
    private executeOpportunity;
    private executeStrategy;
    private performRiskAssessment;
    private logSystemStatus;
    private logHourlySummary;
    getSystemMetrics(): SystemMetrics;
    getStatus(): {
        isRunning: boolean;
        uptime: number;
        strategies: {
            [key: string]: boolean;
        };
        lastScan: number;
    };
    updateStrategy(strategy: "triangular" | "crossDex", settings: {
        enabled?: boolean;
        minProfitThreshold?: BigNumber;
        maxSlippage?: BigNumber;
    }): void;
    getDeepBookService(): DeepBookService;
}
export default ArbitrageBotService;
//# sourceMappingURL=arbitrage-bot.d.ts.map