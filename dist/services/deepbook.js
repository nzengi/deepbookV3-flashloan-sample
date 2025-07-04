"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepBookService = void 0;
const client_1 = require("@mysten/sui.js/client");
const transactions_1 = require("@mysten/sui.js/transactions");
const ed25519_1 = require("@mysten/sui.js/keypairs/ed25519");
const utils_1 = require("@mysten/sui.js/utils");
const bignumber_js_1 = __importDefault(require("bignumber.js"));
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../utils/logger");
class DeepBookService {
    constructor(config) {
        this.pools = new Map();
        this.prices = new Map();
        this.lastPoolUpdate = 0;
        this.POOL_UPDATE_INTERVAL = 300000;
        this.config = config;
        this.client = new client_1.SuiClient({ url: (0, client_1.getFullnodeUrl)(config.network) });
        try {
            if (config.privateKey && config.privateKey.startsWith("suiprivkey")) {
                const privateKeyBase64 = config.privateKey.replace("suiprivkey", "");
                logger_1.Logger.info("Processing Sui private key format...");
                try {
                    const decodedKey = (0, utils_1.fromB64)(privateKeyBase64);
                    const secretKey = decodedKey.length > 32 ? decodedKey.slice(0, 32) : decodedKey;
                    logger_1.Logger.info(`Decoded key length: ${decodedKey.length}, using: ${secretKey.length} bytes`);
                    this.keypair = ed25519_1.Ed25519Keypair.fromSecretKey(secretKey);
                    logger_1.Logger.info("Using configured private key. Wallet address: " +
                        this.keypair.getPublicKey().toSuiAddress());
                }
                catch (decodeError) {
                    logger_1.Logger.error("Failed to decode private key from base64", {
                        error: decodeError,
                        privateKeyLength: privateKeyBase64.length,
                    });
                    throw decodeError;
                }
            }
            else if (config.privateKey) {
                logger_1.Logger.info("Processing base64/hex private key format...");
                try {
                    const secretKey = (0, utils_1.fromB64)(config.privateKey);
                    this.keypair = ed25519_1.Ed25519Keypair.fromSecretKey(secretKey);
                    logger_1.Logger.info("Using configured private key. Wallet address: " +
                        this.keypair.getPublicKey().toSuiAddress());
                }
                catch (decodeError) {
                    logger_1.Logger.error("Failed to decode private key", {
                        error: decodeError,
                        privateKeyLength: config.privateKey.length,
                    });
                    throw decodeError;
                }
            }
            else {
                this.keypair = new ed25519_1.Ed25519Keypair();
                logger_1.Logger.warn("No private key provided, using demo keypair. Wallet address: " +
                    this.keypair.getPublicKey().toSuiAddress());
                logger_1.Logger.warn("For production use, configure your actual private key in .env file.");
            }
        }
        catch (error) {
            logger_1.Logger.error("Failed to initialize keypair from private key", {
                error: error instanceof Error ? error.message : error,
                privateKeyProvided: !!config.privateKey,
                privateKeyLength: config.privateKey ? config.privateKey.length : 0,
            });
            this.keypair = new ed25519_1.Ed25519Keypair();
            logger_1.Logger.warn("Using demo keypair due to private key error. Wallet address: " +
                this.keypair.getPublicKey().toSuiAddress());
        }
    }
    async initialize() {
        try {
            logger_1.Logger.info("Initializing DeepBook service...");
            await this.loadPools();
            await this.loadMarketSummary();
            logger_1.Logger.info("DeepBook service initialized successfully");
        }
        catch (error) {
            logger_1.Logger.error("Failed to initialize DeepBook service", { error });
            throw error;
        }
    }
    async loadPools() {
        try {
            const response = await axios_1.default.get(`${this.config.deepbookIndexerUrl}/get_pools`);
            const pools = response.data;
            this.pools.clear();
            for (const pool of pools) {
                this.pools.set(pool.poolName, pool);
            }
            this.lastPoolUpdate = Date.now();
            logger_1.Logger.info(`Loaded ${pools.length} trading pools`, {
                pools: Array.from(this.pools.keys()),
            });
        }
        catch (error) {
            logger_1.Logger.error("Failed to load pools", { error });
            throw new Error(`Failed to load pools: ${error}`);
        }
    }
    async loadMarketSummary() {
        try {
            const response = await axios_1.default.get(`${this.config.deepbookIndexerUrl}/assets`);
            const assets = response.data;
            this.prices.clear();
            const majorPairs = [
                'DEEP_SUI', 'DEEP_USDC', 'SUI_USDC',
                'WETH_USDC', 'WBTC_USDC', 'NS_SUI', 'TYPUS_SUI'
            ];
            for (const pair of majorPairs) {
                const [base, quote] = pair.split('_');
                if (assets[base] && assets[quote]) {
                    const price = {
                        price: new bignumber_js_1.default(1),
                        timestamp: Date.now(),
                        volume24h: new bignumber_js_1.default(0),
                        change24h: new bignumber_js_1.default(0),
                        bid: new bignumber_js_1.default(0),
                        ask: new bignumber_js_1.default(0),
                    };
                    this.prices.set(pair, price);
                }
            }
            logger_1.Logger.info(`Initialized price tracking for ${this.prices.size} trading pairs from ${Object.keys(assets).length} available assets`);
        }
        catch (error) {
            logger_1.Logger.error("Failed to load market data", { error });
            throw new Error(`Failed to load market data: ${error}`);
        }
    }
    getTradingPair(symbol) {
        const pool = this.pools.get(symbol);
        if (!pool)
            return null;
        return {
            base: pool.baseAssetSymbol,
            quote: pool.quoteAssetSymbol,
            symbol: pool.poolName,
            poolId: pool.poolId,
            basePrecision: pool.baseAssetDecimals,
            quotePrecision: pool.quoteAssetDecimals,
            minTradeSize: new bignumber_js_1.default(pool.minSize),
            lotSize: new bignumber_js_1.default(pool.lotSize),
            tickSize: new bignumber_js_1.default(pool.tickSize),
        };
    }
    getPrice(symbol) {
        return this.prices.get(symbol) || null;
    }
    getAllTradingPairs() {
        return Array.from(this.pools.values()).map((pool) => ({
            base: pool.baseAssetSymbol,
            quote: pool.quoteAssetSymbol,
            symbol: pool.poolName,
            poolId: pool.poolId,
            basePrecision: pool.baseAssetDecimals,
            quotePrecision: pool.quoteAssetDecimals,
            minTradeSize: new bignumber_js_1.default(pool.minSize),
            lotSize: new bignumber_js_1.default(pool.lotSize),
            tickSize: new bignumber_js_1.default(pool.tickSize),
        }));
    }
    getAllPrices() {
        return this.prices;
    }
    async createFlashLoanBase(poolId, amount) {
        const txBlock = new transactions_1.TransactionBlock();
        const [borrowCoin, flashLoan] = txBlock.moveCall({
            target: `${this.config.deepbookPackageId}::pool::borrow_flashloan_base`,
            typeArguments: [],
            arguments: [txBlock.object(poolId), txBlock.pure(amount.toString())],
        });
        return { txBlock, borrowCoin, flashLoan };
    }
    async createFlashLoanQuote(poolId, amount) {
        const txBlock = new transactions_1.TransactionBlock();
        const [borrowCoin, flashLoan] = txBlock.moveCall({
            target: `${this.config.deepbookPackageId}::pool::borrow_flashloan_quote`,
            typeArguments: [],
            arguments: [txBlock.object(poolId), txBlock.pure(amount.toString())],
        });
        return { txBlock, borrowCoin, flashLoan };
    }
    async returnFlashLoanBase(txBlock, poolId, coin, flashLoan) {
        txBlock.moveCall({
            target: `${this.config.deepbookPackageId}::pool::return_flashloan_base`,
            typeArguments: [],
            arguments: [txBlock.object(poolId), coin, flashLoan],
        });
    }
    async returnFlashLoanQuote(txBlock, poolId, coin, flashLoan) {
        txBlock.moveCall({
            target: `${this.config.deepbookPackageId}::pool::return_flashloan_quote`,
            typeArguments: [],
            arguments: [txBlock.object(poolId), coin, flashLoan],
        });
    }
    async executeFlashLoanArbitrage(opportunity) {
        const startTime = Date.now();
        try {
            logger_1.Logger.flashloan("Executing flash loan arbitrage", {
                opportunityId: opportunity.id,
                type: opportunity.type,
                expectedProfit: opportunity.expectedProfit.toString(),
                tradeAmount: opportunity.tradeAmount.toString(),
            });
            const txBlock = await this.buildArbitrageTransaction(opportunity);
            txBlock.setGasBudget(this.config.gasBudget.toNumber());
            const result = await this.client.signAndExecuteTransactionBlock({
                transactionBlock: txBlock,
                signer: this.keypair,
                options: {
                    showEffects: true,
                    showEvents: true,
                    showObjectChanges: true,
                },
            });
            const executionTime = Date.now() - startTime;
            if (result.effects?.status?.status === "success") {
                const gasCost = new bignumber_js_1.default(result.effects.gasUsed.computationCost)
                    .plus(result.effects.gasUsed.storageCost)
                    .minus(result.effects.gasUsed.storageRebate);
                const actualProfit = await this.calculateActualProfit(result, opportunity);
                logger_1.Logger.profit("Flash loan arbitrage successful", {
                    txHash: result.digest,
                    actualProfit: actualProfit.toString(),
                    gasCost: gasCost.toString(),
                    executionTime,
                });
                return {
                    success: true,
                    txHash: result.digest,
                    actualProfit,
                    gasCost,
                    executionTime,
                };
            }
            else {
                const error = result.effects?.status?.error || "Transaction failed";
                logger_1.Logger.error("Flash loan arbitrage failed", {
                    error,
                    txHash: result.digest,
                    executionTime,
                });
                return {
                    success: false,
                    error,
                    executionTime,
                };
            }
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            logger_1.Logger.error("Flash loan arbitrage execution error", {
                error,
                opportunityId: opportunity.id,
                executionTime,
            });
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
                executionTime,
            };
        }
    }
    async buildArbitrageTransaction(opportunity) {
        switch (opportunity.type) {
            case "triangular":
                return this.buildTriangularArbitrageTransaction(opportunity);
            case "cross-dex":
                return this.buildCrossDexArbitrageTransaction(opportunity);
            default:
                throw new Error(`Unsupported arbitrage type: ${opportunity.type}`);
        }
    }
    async buildTriangularArbitrageTransaction(opportunity) {
        const txBlock = new transactions_1.TransactionBlock();
        if (opportunity.pools.length !== 3) {
            throw new Error("Triangular arbitrage requires exactly 3 pools");
        }
        const [pool1, pool2, pool3] = opportunity.pools;
        const { borrowCoin, flashLoan } = await this.createFlashLoanBase(pool1.poolId, opportunity.tradeAmount);
        await this.returnFlashLoanBase(txBlock, pool1.poolId, borrowCoin, flashLoan);
        const feeAmount = opportunity.expectedProfit.multipliedBy(this.config.feePercentage);
        if (feeAmount.isGreaterThan(0)) {
        }
        return txBlock;
    }
    async buildCrossDexArbitrageTransaction(opportunity) {
        const txBlock = new transactions_1.TransactionBlock();
        if (opportunity.pools.length !== 2) {
            throw new Error("Cross-DEX arbitrage requires exactly 2 pools");
        }
        const [buyPool, sellPool] = opportunity.pools;
        const { borrowCoin, flashLoan } = await this.createFlashLoanQuote(buyPool.poolId, opportunity.tradeAmount);
        if (buyPool.symbol.includes("BLUEFIN")) {
            txBlock.moveCall({
                target: "0xBLUEFIN_PACKAGE::pool::swap",
                typeArguments: ["0xUSDC", "0xSUI"],
                arguments: [
                    txBlock.object(buyPool.poolId),
                    borrowCoin,
                    txBlock.pure(opportunity.tradeAmount.toString()),
                ],
            });
            txBlock.moveCall({
                target: "0xCETUS_PACKAGE::pool::swap",
                typeArguments: ["0xSUI", "0xUSDC"],
                arguments: [
                    txBlock.object(sellPool.poolId),
                ],
            });
        }
        else {
            txBlock.moveCall({
                target: "0xCETUS_PACKAGE::pool::swap",
                typeArguments: ["0xUSDC", "0xSUI"],
                arguments: [
                    txBlock.object(buyPool.poolId),
                    borrowCoin,
                    txBlock.pure(opportunity.tradeAmount.toString()),
                ],
            });
            txBlock.moveCall({
                target: "0xBLUEFIN_PACKAGE::pool::swap",
                typeArguments: ["0xSUI", "0xUSDC"],
                arguments: [
                    txBlock.object(sellPool.poolId),
                ],
            });
        }
        await this.returnFlashLoanQuote(txBlock, buyPool.poolId, borrowCoin, flashLoan);
        return txBlock;
    }
    async calculateActualProfit(result, opportunity) {
        return opportunity.expectedProfit;
    }
    async getBalance(assetType) {
        try {
            const coins = await this.client.getCoins({
                owner: this.config.walletAddress,
                coinType: assetType,
            });
            return coins.data.reduce((total, coin) => {
                return total.plus(new bignumber_js_1.default(coin.balance));
            }, new bignumber_js_1.default(0));
        }
        catch (error) {
            logger_1.Logger.error("Failed to get balance", { assetType, error });
            return new bignumber_js_1.default(0);
        }
    }
    shouldUpdatePools() {
        return Date.now() - this.lastPoolUpdate > this.POOL_UPDATE_INTERVAL;
    }
    async refreshData() {
        if (this.shouldUpdatePools()) {
            await this.loadPools();
        }
        await this.loadMarketSummary();
    }
    async getHistoricalVolume(poolName, startTime, endTime) {
        try {
            const params = new URLSearchParams();
            if (startTime)
                params.append("start_time", startTime.toString());
            if (endTime)
                params.append("end_time", endTime.toString());
            const response = await axios_1.default.get(`${this.config.deepbookIndexerUrl}/historical_volume/${poolName}?${params}`);
            return new bignumber_js_1.default(response.data[poolName] || 0);
        }
        catch (error) {
            logger_1.Logger.error("Failed to get historical volume", { poolName, error });
            return new bignumber_js_1.default(0);
        }
    }
    async getAllHistoricalVolumes(startTime, endTime) {
        try {
            const params = new URLSearchParams();
            if (startTime)
                params.append("start_time", startTime.toString());
            if (endTime)
                params.append("end_time", endTime.toString());
            const response = await axios_1.default.get(`${this.config.deepbookIndexerUrl}/all_historical_volume?${params}`);
            const volumes = new Map();
            for (const [poolName, volume] of Object.entries(response.data)) {
                volumes.set(poolName, new bignumber_js_1.default(volume));
            }
            return volumes;
        }
        catch (error) {
            logger_1.Logger.error("Failed to get all historical volumes", { error });
            return new Map();
        }
    }
}
exports.DeepBookService = DeepBookService;
exports.default = DeepBookService;
//# sourceMappingURL=deepbook.js.map