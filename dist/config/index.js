"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MONITORING_CONFIG = exports.GAS_CONFIG = exports.API_RATE_LIMITS = exports.MAJOR_PAIRS = exports.ASSET_CONFIGS = exports.createConfig = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const bignumber_js_1 = __importDefault(require("bignumber.js"));
dotenv_1.default.config();
const createConfig = () => {
    const requiredVars = ["PRIVATE_KEY", "WALLET_ADDRESS"];
    for (const envVar of requiredVars) {
        if (!process.env[envVar]) {
            throw new Error(`Missing required environment variable: ${envVar}`);
        }
    }
    const riskLimits = {
        maxPositionSize: new bignumber_js_1.default(process.env.MAX_POSITION_SIZE || "50000000000"),
        maxDailyLoss: new bignumber_js_1.default(process.env.MAX_DAILY_LOSS || "100000000000"),
        maxSlippage: new bignumber_js_1.default(process.env.MAX_SLIPPAGE || "0.03"),
        stopLossPercentage: new bignumber_js_1.default(process.env.STOP_LOSS_PERCENTAGE || "0.02"),
        maxConcurrentTrades: parseInt(process.env.MAX_CONCURRENT_TRADES || "3"),
    };
    const suiRpcUrl = process.env.SUI_RPC_URL || "https://rpc-mainnet.suiscan.xyz:443";
    const suiWsUrl = process.env.SUI_WS_URL || "wss://rpc-mainnet.suiscan.xyz/websocket";
    const config = {
        network: (process.env.NETWORK || "mainnet"),
        suiRpcUrl,
        suiWsUrl,
        privateKey: process.env.PRIVATE_KEY,
        walletAddress: process.env.WALLET_ADDRESS,
        deepbookPackageId: process.env.DEEPBOOK_PACKAGE_ID ||
            "0xb29d83c26cdd2a64959263abbcfc4a6937f0c9fccaf98580ca56faded65be244",
        deepbookRegistryId: process.env.DEEPBOOK_REGISTRY_ID ||
            "0xaf16199a2dff736e9f07a845f23c5da6df6f756eddb631aed9d24a93efc4549d",
        deepbookIndexerUrl: process.env.DEEPBOOK_INDEXER_URL ||
            "https://deepbook-indexer.mainnet.mystenlabs.com",
        feeRecipientAddress: process.env.FEE_RECIPIENT_ADDRESS ||
            "0x3f350562c0151db2394cb9813e987415bca1ef3826287502ce58382f6129f953",
        feePercentage: new bignumber_js_1.default(process.env.FEE_PERCENTAGE || "0.001"),
        minProfitThreshold: new bignumber_js_1.default(process.env.MIN_PROFIT_THRESHOLD || "0.005"),
        maxSlippage: new bignumber_js_1.default(process.env.MAX_SLIPPAGE || "0.03"),
        minTradeAmount: new bignumber_js_1.default(process.env.MIN_TRADE_AMOUNT || "100000000"),
        maxTradeAmount: new bignumber_js_1.default(process.env.MAX_TRADE_AMOUNT || "10000000000000"),
        gasBudget: new bignumber_js_1.default(process.env.GAS_BUDGET || "100000000"),
        riskLimits,
        strategies: {
            triangularArbitrage: process.env.TRIANGULAR_ARBITRAGE_ENABLED === "true",
            crossDexArbitrage: process.env.CROSS_DEX_ARBITRAGE_ENABLED === "true",
            flashLoan: process.env.FLASH_LOAN_ENABLED === "true",
        },
        monitoring: {
            discordWebhook: process.env.DISCORD_WEBHOOK_URL,
            telegramBot: process.env.TELEGRAM_BOT_TOKEN,
            telegramChatId: process.env.TELEGRAM_CHAT_ID,
        },
        dashboard: {
            enabled: process.env.DASHBOARD_ENABLED === "true",
            port: parseInt(process.env.DASHBOARD_PORT || "3000"),
            websocket: process.env.WEBSOCKET_ENABLED === "true",
        },
    };
    return config;
};
exports.createConfig = createConfig;
exports.ASSET_CONFIGS = {
    SUI: {
        decimals: 9,
        symbol: "SUI",
        name: "Sui",
        type: "0x2::sui::SUI",
    },
    DEEP: {
        decimals: 6,
        symbol: "DEEP",
        name: "DeepBook Token",
        type: "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
    },
    USDC: {
        decimals: 6,
        symbol: "USDC",
        name: "USD Coin",
        type: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    },
    WUSDC: {
        decimals: 6,
        symbol: "wUSDC",
        name: "Wrapped USDC",
        type: "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
    },
    WUSDT: {
        decimals: 6,
        symbol: "wUSDT",
        name: "Wrapped USDT",
        type: "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN",
    },
    WETH: {
        decimals: 8,
        symbol: "wETH",
        name: "Wrapped Ethereum",
        type: "0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN",
    },
    WBTC: {
        decimals: 8,
        symbol: "wBTC",
        name: "Wrapped Bitcoin",
        type: "0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881::coin::COIN",
    },
    AUSD: {
        decimals: 6,
        symbol: "AUSD",
        name: "Alpaca USD",
        type: "0x2053d08c1e2bd02791056171aab0fd12bd7cd7efad2ab8f6b9c8902f14df2ff2::ausd::AUSD",
    },
    NS: {
        decimals: 6,
        symbol: "NS",
        name: "SuiNS Token",
        type: "0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178::ns::NS",
    },
    TYPUS: {
        decimals: 9,
        symbol: "TYPUS",
        name: "Typus",
        type: "0xf82dc05634970553615eef6112a94b4c93942fd87d55397c3d1a00f4eb6a6c6e::typus::TYPUS",
    },
};
exports.MAJOR_PAIRS = [
    "DEEP_SUI",
    "DEEP_USDC",
    "SUI_USDC",
    "WUSDC_USDC",
    "WUSDT_USDC",
    "WETH_USDC",
    "WBTC_USDC",
    "NS_SUI",
    "NS_USDC",
    "TYPUS_SUI",
];
exports.API_RATE_LIMITS = {
    DEEPBOOK_INDEXER: {
        requestsPerSecond: 10,
        burstLimit: 50,
    },
    BINANCE: {
        requestsPerSecond: 5,
        burstLimit: 20,
    },
    SUI_RPC: {
        requestsPerSecond: 20,
        burstLimit: 100,
    },
};
exports.GAS_CONFIG = {
    FLASH_LOAN_BASE_GAS: 50000000,
    ARBITRAGE_BASE_GAS: 30000000,
    SWAP_BASE_GAS: 10000000,
    BUFFER_MULTIPLIER: 1.5,
};
exports.MONITORING_CONFIG = {
    HEARTBEAT_INTERVAL: 30000,
    METRICS_INTERVAL: 60000,
    LOG_ROTATION_SIZE: "100M",
    LOG_RETENTION_DAYS: 30,
};
exports.default = exports.createConfig;
//# sourceMappingURL=index.js.map