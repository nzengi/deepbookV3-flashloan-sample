import { TransactionBlock } from "@mysten/sui.js/transactions";
import BigNumber from "bignumber.js";
import { BotConfig, TradingPair, FlashLoanOpportunity, FlashLoanResult, Price } from "../types/index";
export declare class DeepBookService {
    private client;
    private keypair;
    private config;
    private pools;
    private prices;
    private lastPoolUpdate;
    private readonly POOL_UPDATE_INTERVAL;
    constructor(config: BotConfig);
    initialize(): Promise<void>;
    loadPools(): Promise<void>;
    loadMarketSummary(): Promise<void>;
    getTradingPair(symbol: string): TradingPair | null;
    getPrice(symbol: string): Price | null;
    getAllTradingPairs(): TradingPair[];
    getAllPrices(): Map<string, Price>;
    createFlashLoanBase(poolId: string, amount: BigNumber): Promise<{
        txBlock: TransactionBlock;
        borrowCoin: any;
        flashLoan: any;
    }>;
    createFlashLoanQuote(poolId: string, amount: BigNumber): Promise<{
        txBlock: TransactionBlock;
        borrowCoin: any;
        flashLoan: any;
    }>;
    returnFlashLoanBase(txBlock: TransactionBlock, poolId: string, coin: any, flashLoan: any): Promise<void>;
    returnFlashLoanQuote(txBlock: TransactionBlock, poolId: string, coin: any, flashLoan: any): Promise<void>;
    executeFlashLoanArbitrage(opportunity: FlashLoanOpportunity): Promise<FlashLoanResult>;
    private buildArbitrageTransaction;
    private buildTriangularArbitrageTransaction;
    private buildCrossDexArbitrageTransaction;
    private calculateActualProfit;
    getBalance(assetType: string): Promise<BigNumber>;
    private shouldUpdatePools;
    refreshData(): Promise<void>;
    getHistoricalVolume(poolName: string, startTime?: number, endTime?: number): Promise<BigNumber>;
    getAllHistoricalVolumes(startTime?: number, endTime?: number): Promise<Map<string, BigNumber>>;
}
export default DeepBookService;
//# sourceMappingURL=deepbook.d.ts.map