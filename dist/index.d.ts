#!/usr/bin/env node
declare class ArbitrageBotApp {
    private botService?;
    private dashboardServer?;
    private config;
    start(): Promise<void>;
    stop(): Promise<void>;
    private setupGracefulShutdown;
}
export default ArbitrageBotApp;
//# sourceMappingURL=index.d.ts.map