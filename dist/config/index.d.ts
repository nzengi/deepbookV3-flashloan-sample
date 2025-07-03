import { BotConfig } from '../types/index';
export declare const createConfig: () => BotConfig;
export declare const ASSET_CONFIGS: {
    SUI: {
        decimals: number;
        symbol: string;
        name: string;
        type: string;
    };
    DEEP: {
        decimals: number;
        symbol: string;
        name: string;
        type: string;
    };
    USDC: {
        decimals: number;
        symbol: string;
        name: string;
        type: string;
    };
    WUSDC: {
        decimals: number;
        symbol: string;
        name: string;
        type: string;
    };
    WUSDT: {
        decimals: number;
        symbol: string;
        name: string;
        type: string;
    };
    WETH: {
        decimals: number;
        symbol: string;
        name: string;
        type: string;
    };
    WBTC: {
        decimals: number;
        symbol: string;
        name: string;
        type: string;
    };
    AUSD: {
        decimals: number;
        symbol: string;
        name: string;
        type: string;
    };
    NS: {
        decimals: number;
        symbol: string;
        name: string;
        type: string;
    };
    TYPUS: {
        decimals: number;
        symbol: string;
        name: string;
        type: string;
    };
};
export declare const MAJOR_PAIRS: string[];
export declare const API_RATE_LIMITS: {
    DEEPBOOK_INDEXER: {
        requestsPerSecond: number;
        burstLimit: number;
    };
    BINANCE: {
        requestsPerSecond: number;
        burstLimit: number;
    };
    SUI_RPC: {
        requestsPerSecond: number;
        burstLimit: number;
    };
};
export declare const GAS_CONFIG: {
    FLASH_LOAN_BASE_GAS: number;
    ARBITRAGE_BASE_GAS: number;
    SWAP_BASE_GAS: number;
    BUFFER_MULTIPLIER: number;
};
export declare const MONITORING_CONFIG: {
    HEARTBEAT_INTERVAL: number;
    METRICS_INTERVAL: number;
    LOG_ROTATION_SIZE: string;
    LOG_RETENTION_DAYS: number;
};
export default createConfig;
//# sourceMappingURL=index.d.ts.map