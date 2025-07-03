import dotenv from 'dotenv';
import BigNumber from 'bignumber.js';
import { BotConfig, RiskLimits } from '../types/index';

// Load environment variables
dotenv.config();

export const createConfig = (): BotConfig => {
  // Validate required environment variables
  const requiredVars = ['PRIVATE_KEY', 'WALLET_ADDRESS'];
  for (const envVar of requiredVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  const riskLimits: RiskLimits = {
    maxPositionSize: new BigNumber(process.env.MAX_POSITION_SIZE || '50000000000'), // 50 SUI
    maxDailyLoss: new BigNumber(process.env.MAX_DAILY_LOSS || '100000000000'), // 100 SUI
    maxSlippage: new BigNumber(process.env.MAX_SLIPPAGE || '0.03'), // 3%
    stopLossPercentage: new BigNumber(process.env.STOP_LOSS_PERCENTAGE || '0.02'), // 2%
    maxConcurrentTrades: parseInt(process.env.MAX_CONCURRENT_TRADES || '3')
  };

  const config: BotConfig = {
    network: (process.env.NETWORK || 'mainnet') as 'mainnet' | 'testnet',
    suiRpcUrl: process.env.SUI_RPC_URL || 'https://sui-mainnet.mystenlabs.com',
    privateKey: process.env.PRIVATE_KEY!,
    walletAddress: process.env.WALLET_ADDRESS!,
    deepbookPackageId: process.env.DEEPBOOK_PACKAGE_ID || 
      '0xb29d83c26cdd2a64959263abbcfc4a6937f0c9fccaf98580ca56faded65be244',
    deepbookRegistryId: process.env.DEEPBOOK_REGISTRY_ID || 
      '0xaf16199a2dff736e9f07a845f23c5da6df6f756eddb631aed9d24a93efc4549d',
    deepbookIndexerUrl: process.env.DEEPBOOK_INDEXER_URL || 
      'https://deepbook-indexer.mainnet.mystenlabs.com',
    feeRecipientAddress: process.env.FEE_RECIPIENT_ADDRESS || 
      '0x3f350562c0151db2394cb9813e987415bca1ef3826287502ce58382f6129f953',
    feePercentage: new BigNumber(process.env.FEE_PERCENTAGE || '0.001'), // 0.1%
    minProfitThreshold: new BigNumber(process.env.MIN_PROFIT_THRESHOLD || '0.005'), // 0.5%
    maxSlippage: new BigNumber(process.env.MAX_SLIPPAGE || '0.03'), // 3%
    minTradeAmount: new BigNumber(process.env.MIN_TRADE_AMOUNT || '100000000'), // 0.1 SUI
    maxTradeAmount: new BigNumber(process.env.MAX_TRADE_AMOUNT || '10000000000000'), // 10,000 SUI
    gasBudget: new BigNumber(process.env.GAS_BUDGET || '100000000'), // 0.1 SUI
    riskLimits,
    strategies: {
      triangularArbitrage: process.env.TRIANGULAR_ARBITRAGE_ENABLED === 'true',
      crossDexArbitrage: process.env.CROSS_DEX_ARBITRAGE_ENABLED === 'true',
      flashLoan: process.env.FLASH_LOAN_ENABLED === 'true'
    },
    monitoring: {
      discordWebhook: process.env.DISCORD_WEBHOOK_URL,
      telegramBot: process.env.TELEGRAM_BOT_TOKEN,
      telegramChatId: process.env.TELEGRAM_CHAT_ID
    },
    dashboard: {
      enabled: process.env.DASHBOARD_ENABLED === 'true',
      port: parseInt(process.env.DASHBOARD_PORT || '3000'),
      websocket: process.env.WEBSOCKET_ENABLED === 'true'
    }
  };

  return config;
};

// Asset configurations
export const ASSET_CONFIGS = {
  'SUI': {
    decimals: 9,
    symbol: 'SUI',
    name: 'Sui',
    type: '0x2::sui::SUI'
  },
  'DEEP': {
    decimals: 6,
    symbol: 'DEEP',
    name: 'DeepBook Token',
    type: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP'
  },
  'USDC': {
    decimals: 6,
    symbol: 'USDC',
    name: 'USD Coin',
    type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'
  },
  'WUSDC': {
    decimals: 6,
    symbol: 'wUSDC',
    name: 'Wrapped USDC',
    type: '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN'
  },
  'WUSDT': {
    decimals: 6,
    symbol: 'wUSDT',
    name: 'Wrapped USDT',
    type: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN'
  },
  'WETH': {
    decimals: 8,
    symbol: 'wETH',
    name: 'Wrapped Ethereum',
    type: '0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN'
  },
  'WBTC': {
    decimals: 8,
    symbol: 'wBTC',
    name: 'Wrapped Bitcoin',
    type: '0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881::coin::COIN'
  },
  'AUSD': {
    decimals: 6,
    symbol: 'AUSD',
    name: 'Alpaca USD',
    type: '0x2053d08c1e2bd02791056171aab0fd12bd7cd7efad2ab8f6b9c8902f14df2ff2::ausd::AUSD'
  },
  'NS': {
    decimals: 6,
    symbol: 'NS',
    name: 'SuiNS Token',
    type: '0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178::ns::NS'
  },
  'TYPUS': {
    decimals: 9,
    symbol: 'TYPUS',
    name: 'Typus',
    type: '0xf82dc05634970553615eef6112a94b4c93942fd87d55397c3d1a00f4eb6a6c6e::typus::TYPUS'
  }
};

// Major trading pairs configuration
export const MAJOR_PAIRS = [
  'DEEP_SUI',
  'DEEP_USDC',
  'SUI_USDC',
  'WUSDC_USDC',
  'WUSDT_USDC',
  'WETH_USDC',
  'WBTC_USDC',
  'NS_SUI',
  'NS_USDC',
  'TYPUS_SUI'
];

// API Rate limits
export const API_RATE_LIMITS = {
  DEEPBOOK_INDEXER: {
    requestsPerSecond: 10,
    burstLimit: 50
  },
  BINANCE: {
    requestsPerSecond: 5,
    burstLimit: 20
  },
  SUI_RPC: {
    requestsPerSecond: 20,
    burstLimit: 100
  }
};

// Gas configuration
export const GAS_CONFIG = {
  FLASH_LOAN_BASE_GAS: 50000000, // 0.05 SUI
  ARBITRAGE_BASE_GAS: 30000000, // 0.03 SUI
  SWAP_BASE_GAS: 10000000, // 0.01 SUI
  BUFFER_MULTIPLIER: 1.5
};

// Monitoring configuration
export const MONITORING_CONFIG = {
  HEARTBEAT_INTERVAL: 30000, // 30 seconds
  METRICS_INTERVAL: 60000, // 1 minute
  LOG_ROTATION_SIZE: '100M',
  LOG_RETENTION_DAYS: 30
};

export default createConfig;