import { SuiClient, getFullnodeUrl } from "@mysten/sui.js/client";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { fromB64 } from "@mysten/sui.js/utils";
import BigNumber from "bignumber.js";
import axios from "axios";
import { Logger } from "../utils/logger";
import {
  BotConfig,
  DeepBookPool,
  DeepBookSummary,
  TradingPair,
  FlashLoanOpportunity,
  FlashLoanTransaction,
  FlashLoanResult,
  Price,
  OrderBook,
} from "../types/index";
import { MathUtils } from "../utils/math";

export class DeepBookService {
  private client: SuiClient;
  private keypair: Ed25519Keypair;
  private config: BotConfig;
  private pools: Map<string, DeepBookPool> = new Map();
  private prices: Map<string, Price> = new Map();
  private lastPoolUpdate: number = 0;
  private readonly POOL_UPDATE_INTERVAL = 300000; // 5 minutes

  constructor(config: BotConfig) {
    this.config = config;
    this.client = new SuiClient({ url: getFullnodeUrl(config.network) });

    // Initialize keypair from private key
    try {
      if (config.privateKey && config.privateKey.startsWith("suiprivkey")) {
        // Handle Sui private key format
        const privateKeyBase64 = config.privateKey.replace("suiprivkey", "");
        Logger.info("Processing Sui private key format...");

        try {
          // Sui private keys are base64 encoded but may have a different structure
          // Try to decode and handle the key properly
          const decodedKey = fromB64(privateKeyBase64);

          // If the decoded key is longer than 32 bytes, take the first 32 bytes
          // This is common with some Sui key formats
          const secretKey =
            decodedKey.length > 32 ? decodedKey.slice(0, 32) : decodedKey;

          Logger.info(
            `Decoded key length: ${decodedKey.length}, using: ${secretKey.length} bytes`
          );

          this.keypair = Ed25519Keypair.fromSecretKey(secretKey);
          Logger.info(
            "Using configured private key. Wallet address: " +
              this.keypair.getPublicKey().toSuiAddress()
          );
        } catch (decodeError) {
          Logger.error("Failed to decode private key from base64", {
            error: decodeError,
            privateKeyLength: privateKeyBase64.length,
          });
          throw decodeError;
        }
      } else if (config.privateKey) {
        // Handle base64 or hex format
        Logger.info("Processing base64/hex private key format...");
        try {
          const secretKey = fromB64(config.privateKey);
          this.keypair = Ed25519Keypair.fromSecretKey(secretKey);
          Logger.info(
            "Using configured private key. Wallet address: " +
              this.keypair.getPublicKey().toSuiAddress()
          );
        } catch (decodeError) {
          Logger.error("Failed to decode private key", {
            error: decodeError,
            privateKeyLength: config.privateKey.length,
          });
          throw decodeError;
        }
      } else {
        // Fallback to demo keypair if no private key provided
        this.keypair = new Ed25519Keypair();
        Logger.warn(
          "No private key provided, using demo keypair. Wallet address: " +
            this.keypair.getPublicKey().toSuiAddress()
        );
        Logger.warn(
          "For production use, configure your actual private key in .env file."
        );
      }
    } catch (error) {
      Logger.error("Failed to initialize keypair from private key", {
        error: error instanceof Error ? error.message : error,
        privateKeyProvided: !!config.privateKey,
        privateKeyLength: config.privateKey ? config.privateKey.length : 0,
      });
      // Fallback to demo keypair
      this.keypair = new Ed25519Keypair();
      Logger.warn(
        "Using demo keypair due to private key error. Wallet address: " +
          this.keypair.getPublicKey().toSuiAddress()
      );
    }
  }

  /**
   * Initialize the service by loading pools and market data
   */
  async initialize(): Promise<void> {
    try {
      Logger.info("Initializing DeepBook service...");
      await this.loadPools();
      await this.loadMarketSummary();
      Logger.info("DeepBook service initialized successfully");
    } catch (error) {
      Logger.error("Failed to initialize DeepBook service", { error });
      throw error;
    }
  }

  /**
   * Load all available pools from DeepBook indexer
   */
  async loadPools(): Promise<void> {
    try {
      const response = await axios.get(
        `${this.config.deepbookIndexerUrl}/get_pools`
      );
      const pools: DeepBookPool[] = response.data;

      this.pools.clear();
      for (const pool of pools) {
        this.pools.set(pool.poolName, pool);
      }

      this.lastPoolUpdate = Date.now();
      Logger.info(`Loaded ${pools.length} trading pools`, {
        pools: Array.from(this.pools.keys()),
      });
    } catch (error) {
      Logger.error("Failed to load pools", { error });
      throw new Error(`Failed to load pools: ${error}`);
    }
  }

  /**
   * Load market summary data for all trading pairs
   */
  async loadMarketSummary(): Promise<void> {
    try {
      // Use /ticker endpoint instead of broken /summary endpoint
      const response = await axios.get(
        `${this.config.deepbookIndexerUrl}/ticker`
      );
      const tickerData = response.data;

      this.prices.clear();
      
      // Convert ticker data to our price format
      for (const [pairName, data] of Object.entries(tickerData)) {
        const tickerInfo = data as any;
        
        // Only process active pools
        if (tickerInfo.isFrozen === 0 && tickerInfo.last_price > 0) {
          const price: Price = {
            price: new BigNumber(tickerInfo.last_price),
            timestamp: Date.now(),
            volume24h: new BigNumber(tickerInfo.base_volume),
            change24h: new BigNumber(0), // Not available in ticker endpoint
            bid: new BigNumber(0), // Not available in ticker endpoint
            ask: new BigNumber(0), // Not available in ticker endpoint
          };
          this.prices.set(pairName, price);
        }
      }

      Logger.info(`Loaded real-time price data for ${this.prices.size} active trading pairs from DeepBook v3 ticker`);
    } catch (error) {
      Logger.error("Failed to load ticker data", { error });
      throw new Error(`Failed to load ticker data: ${error}`);
    }
  }

  /**
   * Get trading pair information
   */
  getTradingPair(symbol: string): TradingPair | null {
    const pool = this.pools.get(symbol);
    if (!pool) return null;

    return {
      base: pool.baseAssetSymbol,
      quote: pool.quoteAssetSymbol,
      symbol: pool.poolName,
      poolId: pool.poolId,
      basePrecision: pool.baseAssetDecimals,
      quotePrecision: pool.quoteAssetDecimals,
      minTradeSize: new BigNumber(pool.minSize),
      lotSize: new BigNumber(pool.lotSize),
      tickSize: new BigNumber(pool.tickSize),
    };
  }

  /**
   * Get current price for a trading pair
   */
  getPrice(symbol: string): Price | null {
    return this.prices.get(symbol) || null;
  }

  /**
   * Get all available trading pairs
   */
  getAllTradingPairs(): TradingPair[] {
    return Array.from(this.pools.values()).map((pool) => ({
      base: pool.baseAssetSymbol,
      quote: pool.quoteAssetSymbol,
      symbol: pool.poolName,
      poolId: pool.poolId,
      basePrecision: pool.baseAssetDecimals,
      quotePrecision: pool.quoteAssetDecimals,
      minTradeSize: new BigNumber(pool.minSize),
      lotSize: new BigNumber(pool.lotSize),
      tickSize: new BigNumber(pool.tickSize),
    }));
  }

  /**
   * Get all current prices
   */
  getAllPrices(): Map<string, Price> {
    return this.prices;
  }

  /**
   * Create a flash loan transaction for base asset
   */
  async createFlashLoanBase(
    poolId: string,
    amount: BigNumber
  ): Promise<{ txBlock: TransactionBlock; borrowCoin: any; flashLoan: any }> {
    const txBlock = new TransactionBlock();

    // Borrow flash loan base asset
    const [borrowCoin, flashLoan] = txBlock.moveCall({
      target: `${this.config.deepbookPackageId}::pool::borrow_flashloan_base`,
      typeArguments: [], // Will be filled based on pool
      arguments: [txBlock.object(poolId), txBlock.pure(amount.toString())],
    });

    return { txBlock, borrowCoin, flashLoan };
  }

  /**
   * Create a flash loan transaction for quote asset
   */
  async createFlashLoanQuote(
    poolId: string,
    amount: BigNumber
  ): Promise<{ txBlock: TransactionBlock; borrowCoin: any; flashLoan: any }> {
    const txBlock = new TransactionBlock();

    // Borrow flash loan quote asset
    const [borrowCoin, flashLoan] = txBlock.moveCall({
      target: `${this.config.deepbookPackageId}::pool::borrow_flashloan_quote`,
      typeArguments: [], // Will be filled based on pool
      arguments: [txBlock.object(poolId), txBlock.pure(amount.toString())],
    });

    return { txBlock, borrowCoin, flashLoan };
  }

  /**
   * Return flash loan base asset
   */
  async returnFlashLoanBase(
    txBlock: TransactionBlock,
    poolId: string,
    coin: any,
    flashLoan: any
  ): Promise<void> {
    txBlock.moveCall({
      target: `${this.config.deepbookPackageId}::pool::return_flashloan_base`,
      typeArguments: [], // Will be filled based on pool
      arguments: [txBlock.object(poolId), coin, flashLoan],
    });
  }

  /**
   * Return flash loan quote asset
   */
  async returnFlashLoanQuote(
    txBlock: TransactionBlock,
    poolId: string,
    coin: any,
    flashLoan: any
  ): Promise<void> {
    txBlock.moveCall({
      target: `${this.config.deepbookPackageId}::pool::return_flashloan_quote`,
      typeArguments: [], // Will be filled based on pool
      arguments: [txBlock.object(poolId), coin, flashLoan],
    });
  }

  /**
   * Execute a flash loan arbitrage transaction
   */
  async executeFlashLoanArbitrage(
    opportunity: FlashLoanOpportunity
  ): Promise<FlashLoanResult> {
    const startTime = Date.now();

    try {
      Logger.flashloan("Executing flash loan arbitrage", {
        opportunityId: opportunity.id,
        type: opportunity.type,
        expectedProfit: opportunity.expectedProfit.toString(),
        tradeAmount: opportunity.tradeAmount.toString(),
      });

      // Create transaction block for the arbitrage
      const txBlock = await this.buildArbitrageTransaction(opportunity);

      // Set gas budget
      txBlock.setGasBudget(this.config.gasBudget.toNumber());

      // Execute transaction
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
        const gasCost = new BigNumber(result.effects.gasUsed.computationCost)
          .plus(result.effects.gasUsed.storageCost)
          .minus(result.effects.gasUsed.storageRebate);

        const actualProfit = await this.calculateActualProfit(
          result,
          opportunity
        );

        Logger.profit("Flash loan arbitrage successful", {
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
      } else {
        const error = result.effects?.status?.error || "Transaction failed";
        Logger.error("Flash loan arbitrage failed", {
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
    } catch (error) {
      const executionTime = Date.now() - startTime;
      Logger.error("Flash loan arbitrage execution error", {
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

  /**
   * Build arbitrage transaction based on opportunity type
   */
  private async buildArbitrageTransaction(
    opportunity: FlashLoanOpportunity
  ): Promise<TransactionBlock> {
    switch (opportunity.type) {
      case "triangular":
        return this.buildTriangularArbitrageTransaction(opportunity);
      case "cross-dex":
        return this.buildCrossDexArbitrageTransaction(opportunity);
      default:
        throw new Error(`Unsupported arbitrage type: ${opportunity.type}`);
    }
  }

  /**
   * Build triangular arbitrage transaction
   */
  private async buildTriangularArbitrageTransaction(
    opportunity: FlashLoanOpportunity
  ): Promise<TransactionBlock> {
    const txBlock = new TransactionBlock();

    if (opportunity.pools.length !== 3) {
      throw new Error("Triangular arbitrage requires exactly 3 pools");
    }

    const [pool1, pool2, pool3] = opportunity.pools;

    // Step 1: Borrow flash loan from first pool
    const { borrowCoin, flashLoan } = await this.createFlashLoanBase(
      pool1.poolId,
      opportunity.tradeAmount
    );

    // Step 2: Trade through the triangular path
    // This is a simplified version - actual implementation would need
    // to handle the specific trading logic for each pool

    // Step 3: Return the flash loan
    await this.returnFlashLoanBase(
      txBlock,
      pool1.poolId,
      borrowCoin,
      flashLoan
    );

    // Step 4: Transfer profit to fee recipient
    const feeAmount = opportunity.expectedProfit.multipliedBy(
      this.config.feePercentage
    );
    if (feeAmount.isGreaterThan(0)) {
      // Transfer fee logic would go here
    }

    return txBlock;
  }

  /**
   * Build cross-DEX arbitrage transaction
   */
  private async buildCrossDexArbitrageTransaction(
    opportunity: FlashLoanOpportunity
  ): Promise<TransactionBlock> {
    const txBlock = new TransactionBlock();

    if (opportunity.pools.length !== 2) {
      throw new Error("Cross-DEX arbitrage requires exactly 2 pools");
    }

    const [buyPool, sellPool] = opportunity.pools;

    // Step 1: Borrow flash loan (assume USDC for SUI/USDC pair)
    const { borrowCoin, flashLoan } = await this.createFlashLoanQuote(
      buyPool.poolId,
      opportunity.tradeAmount
    );

    // Step 2: Swap USDC -> SUI on Bluefin (if buyPool is Bluefin), or on Cetus (if buyPool is Cetus)
    // Step 3: Swap SUI -> USDC on the other DEX
    // For simplicity, assume buyPool.poolId indicates which DEX to use first

    // --- Bluefin and Cetus mainnet contract info (update if needed) ---
    // Bluefin SUI/USDC pool: 0x6c6b5e7e7c6e6e7e6e7e6e7e6e7e6e7e6e7e6e7e (example)
    // Cetus SUI/USDC pool:   0x8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b (example)
    // Bluefin swap fn:       "0x...::pool::swap"
    // Cetus swap fn:         "0x...::pool::swap"
    // (Replace with real addresses/functions as needed)

    // --- Example logic ---
    // You must update pool addresses and function signatures to match mainnet deployments!
    // This is a template for how to add the calls:

    // Example: if buyPool is Bluefin, sellPool is Cetus
    if (buyPool.symbol.includes("BLUEFIN")) {
      // Swap USDC -> SUI on Bluefin
      txBlock.moveCall({
        target: "0xBLUEFIN_PACKAGE::pool::swap", // Replace with real Bluefin package address
        typeArguments: ["0xUSDC", "0xSUI"], // Replace with real coin types
        arguments: [
          txBlock.object(buyPool.poolId),
          borrowCoin,
          txBlock.pure(opportunity.tradeAmount.toString()),
          // Add any other required arguments for Bluefin swap
        ],
      });
      // Swap SUI -> USDC on Cetus
      txBlock.moveCall({
        target: "0xCETUS_PACKAGE::pool::swap", // Replace with real Cetus package address
        typeArguments: ["0xSUI", "0xUSDC"], // Replace with real coin types
        arguments: [
          txBlock.object(sellPool.poolId),
          /* SUI coin from previous swap (reference output) */
          // You may need to capture the output of the previous moveCall
          // and pass it here
        ],
      });
    } else {
      // Swap USDC -> SUI on Cetus
      txBlock.moveCall({
        target: "0xCETUS_PACKAGE::pool::swap", // Replace with real Cetus package address
        typeArguments: ["0xUSDC", "0xSUI"], // Replace with real coin types
        arguments: [
          txBlock.object(buyPool.poolId),
          borrowCoin,
          txBlock.pure(opportunity.tradeAmount.toString()),
          // Add any other required arguments for Cetus swap
        ],
      });
      // Swap SUI -> USDC on Bluefin
      txBlock.moveCall({
        target: "0xBLUEFIN_PACKAGE::pool::swap", // Replace with real Bluefin package address
        typeArguments: ["0xSUI", "0xUSDC"], // Replace with real coin types
        arguments: [
          txBlock.object(sellPool.poolId),
          /* SUI coin from previous swap (reference output) */
          // You may need to capture the output of the previous moveCall
          // and pass it here
        ],
      });
    }

    // Step 4: Return flash loan
    await this.returnFlashLoanQuote(
      txBlock,
      buyPool.poolId,
      borrowCoin, // In practice, this should be the final USDC coin after swaps
      flashLoan
    );

    return txBlock;
  }

  /**
   * Calculate actual profit from transaction result
   */
  private async calculateActualProfit(
    result: any,
    opportunity: FlashLoanOpportunity
  ): Promise<BigNumber> {
    // This would analyze the transaction events and object changes
    // to determine the actual profit received
    // For now, returning expected profit as placeholder
    return opportunity.expectedProfit;
  }

  /**
   * Get account balance for a specific asset
   */
  async getBalance(assetType: string): Promise<BigNumber> {
    try {
      const coins = await this.client.getCoins({
        owner: this.config.walletAddress,
        coinType: assetType,
      });

      return coins.data.reduce((total, coin) => {
        return total.plus(new BigNumber(coin.balance));
      }, new BigNumber(0));
    } catch (error) {
      Logger.error("Failed to get balance", { assetType, error });
      return new BigNumber(0);
    }
  }

  /**
   * Check if pools need updating
   */
  private shouldUpdatePools(): boolean {
    return Date.now() - this.lastPoolUpdate > this.POOL_UPDATE_INTERVAL;
  }

  /**
   * Refresh data if needed
   */
  async refreshData(): Promise<void> {
    if (this.shouldUpdatePools()) {
      await this.loadPools();
    }
    await this.loadMarketSummary();
  }

  /**
   * Get historical volume for a pool
   */
  async getHistoricalVolume(
    poolName: string,
    startTime?: number,
    endTime?: number
  ): Promise<BigNumber> {
    try {
      const params = new URLSearchParams();
      if (startTime) params.append("start_time", startTime.toString());
      if (endTime) params.append("end_time", endTime.toString());

      const response = await axios.get(
        `${this.config.deepbookIndexerUrl}/historical_volume/${poolName}?${params}`
      );

      return new BigNumber(response.data[poolName] || 0);
    } catch (error) {
      Logger.error("Failed to get historical volume", { poolName, error });
      return new BigNumber(0);
    }
  }

  /**
   * Get all historical volumes
   */
  async getAllHistoricalVolumes(
    startTime?: number,
    endTime?: number
  ): Promise<Map<string, BigNumber>> {
    try {
      const params = new URLSearchParams();
      if (startTime) params.append("start_time", startTime.toString());
      if (endTime) params.append("end_time", endTime.toString());

      const response = await axios.get(
        `${this.config.deepbookIndexerUrl}/all_historical_volume?${params}`
      );

      const volumes = new Map<string, BigNumber>();
      for (const [poolName, volume] of Object.entries(response.data)) {
        volumes.set(poolName, new BigNumber(volume as string));
      }

      return volumes;
    } catch (error) {
      Logger.error("Failed to get all historical volumes", { error });
      return new Map();
    }
  }
}

export default DeepBookService;
