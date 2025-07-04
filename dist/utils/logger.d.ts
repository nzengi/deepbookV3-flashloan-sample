declare const Logger: {
    error: any;
    warn: any;
    info: any;
    debug: any;
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