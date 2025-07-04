import { SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import BigNumber from 'bignumber.js';
import axios from 'axios';
import { Logger } from '../utils/logger';
import { BotConfig } from '../types/index';

export interface CetusPool {
  poolAddress: string;
  coinTypeA: string;
  coinTypeB: string;
  currentPrice: BigNumber;
  liquidity: BigNumber;
  symbol: string;
}

export interface CetusSwapResult {
  success: boolean;
  amountOut: BigNumber;
  priceImpact: BigNumber;
  fee: BigNumber;
  txHash?: string;
  error?: string;
}

/**
 * Cetus DEX Service
 * 
 * Handles trading on Cetus protocol for flash loan arbitrage
 */
export class CetusDexService {
  private client: SuiClient;
  private keypair: Ed25519Keypair;
  private sdk: CetusClmmSDK;
  private config: BotConfig;
  private pools: Map<string, CetusPool> = new Map();

  constructor(config: BotConfig, client: SuiClient, keypair: Ed25519Keypair) {
    this.config = config;
    this.client = client;
    this.keypair = keypair;

    // Initialize Cetus SDK
    const sdkOptions: SdkOptions = {
      fullRpcUrl: config.suiRpcUrl,
      network: config.network,
      simulationAccount: {
        address: this.keypair.getPublicKey().toSuiAddress(),
      }
    };

    this.sdk = new CetusClmmSDK(sdkOptions);
    Logger.info('Cetus DEX service initialized');
  }

  /**
   * Initialize Cetus pools and fetch current data
   */
  async initialize(): Promise<void> {
    try {
      // Load major trading pools from Cetus
      const poolConfigs = await this.sdk.Pool.getPools([]);
      
      for (const pool of poolConfigs.data) {
        const cetusPool: CetusPool = {
          poolAddress: pool.poolAddress,
          coinTypeA: pool.coinTypeA,
          coinTypeB: pool.coinTypeB,
          currentPrice: new BigNumber(pool.current_sqrt_price || 0),
          liquidity: new BigNumber(pool.liquidity || 0),
          symbol: `${this.getTokenSymbol(pool.coinTypeA)}/${this.getTokenSymbol(pool.coinTypeB)}`
        };

        this.pools.set(cetusPool.symbol, cetusPool);
      }

      Logger.info(`Loaded ${this.pools.size} Cetus pools`, { pools: Array.from(this.pools.keys()) });
    } catch (error) {
      Logger.error('Failed to initialize Cetus pools', { error });
    }
  }

  /**
   * Get current price for a trading pair from Cetus
   */
  async getPrice(symbol: string): Promise<BigNumber | null> {
    try {
      const pool = this.pools.get(symbol);
      if (!pool) return null;

      // Fetch real-time price from Cetus pool
      const poolData = await this.sdk.Pool.getPool(pool.poolAddress);
      if (poolData && poolData.current_sqrt_price) {
        const price = this.sqrtPriceToPrice(new BigNumber(poolData.current_sqrt_price));
        
        // Update cached price
        pool.currentPrice = price;
        this.pools.set(symbol, pool);
        
        return price;
      }

      return pool.currentPrice;
    } catch (error) {
      Logger.error(`Failed to get Cetus price for ${symbol}`, { error });
      return null;
    }
  }

  /**
   * Execute swap on Cetus DEX
   */
  async executeSwap(
    symbol: string,
    amountIn: BigNumber,
    minAmountOut: BigNumber,
    aToB: boolean
  ): Promise<CetusSwapResult> {
    try {
      const pool = this.pools.get(symbol);
      if (!pool) {
        return {
          success: false,
          amountOut: new BigNumber(0),
          priceImpact: new BigNumber(0),
          fee: new BigNumber(0),
          error: `Pool not found for ${symbol}`
        };
      }

      // Build swap transaction
      const tx = new TransactionBlock();
      
      // Get swap parameters
      const swapParams = {
        pool_id: pool.poolAddress,
        coin_object_ids_a: [], // Will be populated with actual coin objects
        coin_object_ids_b: [],
        a_to_b: aToB,
        by_amount_in: true,
        amount: amountIn.toString(),
        amount_limit: minAmountOut.toString(),
        sqrt_price_limit: this.calculatePriceLimit(pool.currentPrice, aToB).toString(),
        partner: ''
      };

      // Build swap transaction using SDK
      const swapTx = await this.sdk.Swap.createSwapTransactionPayload(swapParams);
      
      // Execute transaction
      const result = await this.client.signAndExecuteTransactionBlock({
        signer: this.keypair,
        transactionBlock: swapTx,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      // Parse swap result
      const swapResult = this.parseSwapResult(result);

      Logger.trade(`Cetus swap executed: ${symbol}`, {
        amountIn: amountIn.toString(),
        amountOut: swapResult.amountOut.toString(),
        aToB,
        txHash: result.digest
      });

      return {
        ...swapResult,
        success: true,
        txHash: result.digest
      };

    } catch (error) {
      Logger.error(`Cetus swap failed for ${symbol}`, { error });
      return {
        success: false,
        amountOut: new BigNumber(0),
        priceImpact: new BigNumber(0),
        fee: new BigNumber(0),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get optimal amount out for given amount in
   */
  async getAmountOut(
    symbol: string,
    amountIn: BigNumber,
    aToB: boolean
  ): Promise<BigNumber | null> {
    try {
      const pool = this.pools.get(symbol);
      if (!pool) return null;

      // Calculate amount out using Cetus SDK
      const preSwap = await this.sdk.Swap.preswap({
        pool: pool.poolAddress,
        current_sqrt_price: pool.currentPrice.toString(),
        current_liquidity: pool.liquidity.toString(),
        a_to_b: aToB,
        by_amount_in: true,
        amount: amountIn.toString()
      });

      return new BigNumber(preSwap.amount_out || 0);
    } catch (error) {
      Logger.error(`Failed to calculate Cetus amount out for ${symbol}`, { error });
      return null;
    }
  }

  /**
   * Get all available pools
   */
  getAllPools(): CetusPool[] {
    return Array.from(this.pools.values());
  }

  /**
   * Get pool information
   */
  getPool(symbol: string): CetusPool | null {
    return this.pools.get(symbol) || null;
  }

  /**
   * Helper: Convert sqrt price to human readable price
   */
  private sqrtPriceToPrice(sqrtPrice: BigNumber): BigNumber {
    return sqrtPrice.pow(2).dividedBy(new BigNumber(2).pow(128));
  }

  /**
   * Helper: Calculate price limit for slippage protection
   */
  private calculatePriceLimit(currentPrice: BigNumber, aToB: boolean): BigNumber {
    const slippage = new BigNumber(0.005); // 0.5% slippage
    if (aToB) {
      return currentPrice.multipliedBy(new BigNumber(1).minus(slippage));
    } else {
      return currentPrice.multipliedBy(new BigNumber(1).plus(slippage));
    }
  }

  /**
   * Helper: Extract token symbol from type
   */
  private getTokenSymbol(coinType: string): string {
    // Extract symbol from coin type string
    if (coinType.includes('::sui::SUI')) return 'SUI';
    if (coinType.includes('::usdc::USDC')) return 'USDC';
    if (coinType.includes('::usdt::USDT')) return 'USDT';
    if (coinType.includes('::weth::WETH')) return 'WETH';
    
    // Extract last part after ::
    const parts = coinType.split('::');
    return parts[parts.length - 1] || 'UNKNOWN';
  }

  /**
   * Helper: Parse swap transaction result
   */
  private parseSwapResult(result: any): Omit<CetusSwapResult, 'success' | 'txHash'> {
    // Parse transaction effects to extract swap amounts
    let amountOut = new BigNumber(0);
    let fee = new BigNumber(0);
    let priceImpact = new BigNumber(0);

    try {
      // Parse from transaction effects
      if (result.effects?.events) {
        for (const event of result.effects.events) {
          if (event.type && event.type.includes('SwapEvent')) {
            amountOut = new BigNumber(event.parsedJson?.amount_out || 0);
            fee = new BigNumber(event.parsedJson?.fee || 0);
            break;
          }
        }
      }

      // Calculate price impact (simplified)
      priceImpact = new BigNumber(0.001); // 0.1% default estimate

    } catch (error) {
      Logger.error('Failed to parse Cetus swap result', { error });
    }

    return {
      amountOut,
      priceImpact,
      fee
    };
  }
}

export default CetusDexService;