import winston from 'winston';
declare const Logger: {
    error: winston.LeveledLogMethod;
    warn: winston.LeveledLogMethod;
    info: winston.LeveledLogMethod;
    debug: winston.LeveledLogMethod;
    trade: (message: string, meta?: any) => void;
    arbitrage: (message: string, meta?: any) => void;
    flashloan: (message: string, meta?: any) => void;
    risk: (message: string, meta?: any) => void;
    profit: (message: string, meta?: any) => void;
    gas: (message: string, meta?: any) => void;
    performance: (message: string, meta?: any) => void;
    external: (message: string, meta?: any) => void;
    security: (message: string, meta?: any) => void;
};
export { Logger };
export default Logger;
//# sourceMappingURL=logger.d.ts.map