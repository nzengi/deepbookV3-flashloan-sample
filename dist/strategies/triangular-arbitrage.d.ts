import BigNumber from 'bignumber.js';
import { ArbitrageStrategy, FlashLoanOpportunity, FlashLoanResult } from '../types/index';
import DeepBookService from '../services/deepbook';
export declare class TriangularArbitrageStrategy implements ArbitrageStrategy {
    readonly name = "Triangular Arbitrage";
    enabled: boolean;
    minProfitThreshold: BigNumber;
    maxSlippage: BigNumber;
    priority: number;
    riskLevel: 'low' | 'medium' | 'high';
    private deepBookService;
    private triangularPaths;
    constructor(deepBookService: DeepBookService, minProfitThreshold: BigNumber, maxSlippage: BigNumber);
    private initializeTriangularPaths;
    private buildTradingPairsFromPath;
    private findTradingPair;
    private calculatePathPriority;
    scanOpportunities(): Promise<FlashLoanOpportunity[]>;
    private analyzeTriangularPath;
    private calculateTriangularArbitrage;
    private findOptimalTradeAmount;
    private calculateSlippage;
    private calculateTradingFee;
    private estimateGasCost;
    private calculateConfidence;
    private generateOpportunityId;
    execute(opportunity: FlashLoanOpportunity): Promise<FlashLoanResult>;
}
export default TriangularArbitrageStrategy;
//# sourceMappingURL=triangular-arbitrage.d.ts.map