import { TransactionBlock } from '@mysten/sui.js/transactions';
import BigNumber from 'bignumber.js';
export interface TradingPair {
    base: string;
    quote: string;
    symbol: string;
    poolId: string;
    basePrecision: number;
    quotePrecision: number;
    minTradeSize: BigNumber;
    lotSize: BigNumber;
    tickSize: BigNumber;
}
export interface Price {
    price: BigNumber;
    timestamp: number;
    volume24h: BigNumber;
    change24h: BigNumber;
    bid: BigNumber;
    ask: BigNumber;
}
export interface OrderBookLevel {
    price: BigNumber;
    quantity: BigNumber;
    total: BigNumber;
}
export interface OrderBook {
    bids: OrderBookLevel[];
    asks: OrderBookLevel[];
    timestamp: number;
}
export interface FlashLoanOpportunity {
    id: string;
    type: 'triangular' | 'cross-dex' | 'liquidation';
    pools: TradingPair[];
    path: string[];
    expectedProfit: BigNumber;
    profitPercentage: BigNumber;
    tradeAmount: BigNumber;
    gasEstimate: BigNumber;
    confidence: number;
    timestamp: number;
}
export interface FlashLoanExecution {
    opportunity: FlashLoanOpportunity;
    txBlock: TransactionBlock;
    estimatedGas: BigNumber;
    deadline: number;
}
export interface FlashLoanResult {
    success: boolean;
    txHash?: string;
    actualProfit?: BigNumber;
    gasCost?: BigNumber;
    error?: string;
    executionTime: number;
}
export interface ArbitrageStrategy {
    name: string;
    enabled: boolean;
    minProfitThreshold: BigNumber;
    maxSlippage: BigNumber;
    priority: number;
    riskLevel: 'low' | 'medium' | 'high';
    execute(opportunity: FlashLoanOpportunity): Promise<FlashLoanResult>;
}
export interface TriangularArbitrageParams {
    startAsset: string;
    path: string[];
    pools: TradingPair[];
    amount: BigNumber;
}
export interface CrossDexArbitrageParams {
    pair: TradingPair;
    buyPool: TradingPair;
    sellPool: TradingPair;
    amount: BigNumber;
}
export interface RiskLimits {
    maxPositionSize: BigNumber;
    maxDailyLoss: BigNumber;
    maxSlippage: BigNumber;
    stopLossPercentage: BigNumber;
    maxConcurrentTrades: number;
}
export interface RiskMetrics {
    totalExposure: BigNumber;
    dailyPnL: BigNumber;
    winRate: number;
    maxDrawdown: BigNumber;
    sharpeRatio: number;
    currentRisk: 'low' | 'medium' | 'high';
}
export interface ExternalPrice {
    symbol: string;
    price: BigNumber;
    timestamp: number;
    source: 'binance' | 'coinbase' | 'kraken' | 'okx';
    volume24h: BigNumber;
}
export interface MarketData {
    prices: Map<string, Price>;
    orderBooks: Map<string, OrderBook>;
    externalPrices: Map<string, ExternalPrice>;
    lastUpdate: number;
}
export interface BotConfig {
    network: 'mainnet' | 'testnet';
    suiRpcUrl: string;
    privateKey: string;
    walletAddress: string;
    deepbookPackageId: string;
    deepbookRegistryId: string;
    deepbookIndexerUrl: string;
    feeRecipientAddress: string;
    feePercentage: BigNumber;
    minProfitThreshold: BigNumber;
    maxSlippage: BigNumber;
    minTradeAmount: BigNumber;
    maxTradeAmount: BigNumber;
    gasBudget: BigNumber;
    riskLimits: RiskLimits;
    strategies: {
        triangularArbitrage: boolean;
        crossDexArbitrage: boolean;
        flashLoan: boolean;
    };
    monitoring: {
        discordWebhook?: string;
        telegramBot?: string;
        telegramChatId?: string;
    };
    dashboard: {
        enabled: boolean;
        port: number;
        websocket: boolean;
    };
}
export interface TradeLog {
    id: string;
    timestamp: number;
    strategy: string;
    type: 'flash-loan' | 'arbitrage' | 'liquidation';
    status: 'pending' | 'success' | 'failed';
    txHash?: string;
    profit?: BigNumber;
    gasCost?: BigNumber;
    error?: string;
    executionTime?: number;
}
export interface SystemMetrics {
    uptime: number;
    totalTrades: number;
    successfulTrades: number;
    totalProfit: BigNumber;
    totalGasCost: BigNumber;
    avgExecutionTime: number;
    currentBalance: BigNumber;
    memoryUsage: number;
    cpuUsage: number;
}
export interface WebSocketMessage {
    type: 'price-update' | 'opportunity' | 'trade-result' | 'system-status';
    data: any;
    timestamp: number;
}
export interface DeepBookPool {
    poolId: string;
    poolName: string;
    baseAssetId: string;
    baseAssetDecimals: number;
    baseAssetSymbol: string;
    baseAssetName: string;
    quoteAssetId: string;
    quoteAssetDecimals: number;
    quoteAssetSymbol: string;
    quoteAssetName: string;
    minSize: number;
    lotSize: number;
    tickSize: number;
}
export interface DeepBookSummary {
    trading_pairs: string;
    quote_currency: string;
    last_price: number;
    lowest_price_24h: number;
    highest_bid: number;
    base_volume: number;
    price_change_percent_24h: number;
    quote_volume: number;
    lowest_ask: number;
    highest_price_24h: number;
    base_currency: string;
}
export interface FlashLoanTransaction {
    borrowCoin: any;
    flashLoan: any;
    repayAmount: BigNumber;
    profitAmount: BigNumber;
}
export declare class ArbitrageError extends Error {
    code: string;
    context?: any | undefined;
    constructor(message: string, code: string, context?: any | undefined);
}
export declare class FlashLoanError extends Error {
    code: string;
    context?: any | undefined;
    constructor(message: string, code: string, context?: any | undefined);
}
export declare class RiskManagementError extends Error {
    code: string;
    context?: any | undefined;
    constructor(message: string, code: string, context?: any | undefined);
}
//# sourceMappingURL=index.d.ts.map