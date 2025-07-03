import BigNumber from 'bignumber.js';
import { ArbitrageStrategy, FlashLoanOpportunity, FlashLoanResult } from '../types/index';
import DeepBookService from '../services/deepbook';
import ExternalDataService from '../services/external-data';
export declare class CrossDexArbitrageStrategy implements ArbitrageStrategy {
    readonly name = "Cross-DEX Arbitrage";
    enabled: boolean;
    minProfitThreshold: BigNumber;
    maxSlippage: BigNumber;
    priority: number;
    riskLevel: 'low' | 'medium' | 'high';
    private deepBookService;
    private externalDataService;
    private monitoredPairs;
    constructor(deepBookService: DeepBookService, externalDataService: ExternalDataService, minProfitThreshold: BigNumber, maxSlippage: BigNumber);
    private initializeMonitoredPairs;
    scanOpportunities(): Promise<FlashLoanOpportunity[]>;
    private analyzeCrossDexPair;
    private calculateOptimalTradeAmount;
    private getAvailableLiquidity;
    private calculateMaxProfitableAmount;
    private calculateExpectedProfit;
    private getConversionRate;
    private estimateGasCost;
    private calculateConfidence;
    private generateOpportunityId;
    execute(opportunity: FlashLoanOpportunity): Promise<FlashLoanResult>;
    getStatistics(): {
        totalPairs: number;
        activePairs: number;
        avgDiscrepancy: BigNumber;
        lastUpdate: number;
    };
}
export default CrossDexArbitrageStrategy;
//# sourceMappingURL=cross-dex-arbitrage.d.ts.map