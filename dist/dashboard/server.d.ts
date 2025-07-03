import { BotConfig, WebSocketMessage } from '../types/index';
import ArbitrageBotService from '../services/arbitrage-bot';
export declare class DashboardServer {
    private app;
    private server;
    private io;
    private config;
    private botService;
    constructor(config: BotConfig, botService: ArbitrageBotService);
    private setupMiddleware;
    private setupRoutes;
    private setupWebSocket;
    private broadcastUpdates;
    sendMessage(message: WebSocketMessage): void;
    start(): Promise<void>;
    stop(): Promise<void>;
}
export default DashboardServer;
//# sourceMappingURL=server.d.ts.map