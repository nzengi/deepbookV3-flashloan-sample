import BigNumber from 'bignumber.js';
import { BotConfig, RiskLimits, RiskMetrics, FlashLoanOpportunity, TradeLog } from '../types/index';
export declare class RiskManagementService {
    private config;
    private riskLimits;
    private currentExposure;
    private dailyPnL;
    private tradeLogs;
    private activeTrades;
    private dailyResetTime;
    private returns;
    constructor(config: BotConfig);
    evaluateOpportunity(opportunity: FlashLoanOpportunity): Promise<{
        approved: boolean;
        reason?: string;
        adjustedAmount?: BigNumber;
    }>;
    private calculateRiskAdjustedSize;
    recordTrade(tradeLog: TradeLog): void;
    getRiskMetrics(): RiskMetrics;
    private assessCurrentRiskLevel;
    private checkDailyReset;
    private resetDailyMetrics;
    private getNextDailyReset;
    shouldEmergencyShutdown(): boolean;
    getRiskSummary(): {
        currentRisk: 'low' | 'medium' | 'high';
        dailyPnL: BigNumber;
        activeTrades: number;
        exposureUtilization: number;
        dailyLossUtilization: number;
        recommendations: string[];
    };
    updateRiskLimits(newLimits: Partial<RiskLimits>): void;
    getPerformanceHistory(days?: number): {
        dailyReturns: {
            date: string;
            pnl: BigNumber;
        }[];
        cumulativeReturn: BigNumber;
        volatility: BigNumber;
        maxDrawdown: BigNumber;
    };
}
export default RiskManagementService;
//# sourceMappingURL=risk-management.d.ts.map