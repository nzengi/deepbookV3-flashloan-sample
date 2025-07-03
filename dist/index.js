#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = __importDefault(require("./utils/logger"));
const index_1 = require("./config/index");
const arbitrage_bot_1 = __importDefault(require("./services/arbitrage-bot"));
const server_1 = __importDefault(require("./dashboard/server"));
class ArbitrageBotApp {
    constructor() {
        this.config = (0, index_1.createConfig)();
    }
    async start() {
        try {
            logger_1.default.info('DeepBook Flash Loan Arbitrage Bot başlatılıyor...');
            logger_1.default.info('Konfigürasyon:', {
                network: this.config.network,
                feeRecipient: this.config.feeRecipientAddress,
                strategies: this.config.strategies,
                dashboard: this.config.dashboard
            });
            this.botService = new arbitrage_bot_1.default(this.config);
            if (this.config.dashboard.enabled && this.botService) {
                this.dashboardServer = new server_1.default(this.config, this.botService);
                await this.dashboardServer.start();
            }
            await this.botService.start();
            logger_1.default.info('Sistem başarıyla başlatıldı');
            logger_1.default.info(`Dashboard: http://localhost:${this.config.dashboard.port}`);
            logger_1.default.info('Arbitraj fırsatları taranıyor...');
            this.setupGracefulShutdown();
        }
        catch (error) {
            logger_1.default.error('Uygulama başlatma hatası:', { error });
            process.exit(1);
        }
    }
    async stop() {
        logger_1.default.info('Uygulama kapatılıyor...');
        try {
            if (this.botService) {
                await this.botService.stop();
            }
            if (this.dashboardServer) {
                await this.dashboardServer.stop();
            }
            logger_1.default.info('Uygulama başarıyla kapatıldı');
            process.exit(0);
        }
        catch (error) {
            logger_1.default.error('Uygulama kapatma hatası:', { error });
            process.exit(1);
        }
    }
    setupGracefulShutdown() {
        process.on('SIGINT', async () => {
            logger_1.default.info('SIGINT signal alındı, kapatılıyor...');
            await this.stop();
        });
        process.on('SIGTERM', async () => {
            logger_1.default.info('SIGTERM signal alındı, kapatılıyor...');
            await this.stop();
        });
        process.on('uncaughtException', (error) => {
            logger_1.default.error('Yakalanmamış hata:', { error });
            this.stop();
        });
        process.on('unhandledRejection', (reason, promise) => {
            logger_1.default.error('İşlenmemiş promise reddi:', { reason, promise });
            this.stop();
        });
    }
}
if (require.main === module) {
    const app = new ArbitrageBotApp();
    app.start().catch((error) => {
        logger_1.default.error('Uygulama başlatma başarısız:', { error });
        process.exit(1);
    });
}
exports.default = ArbitrageBotApp;
//# sourceMappingURL=index.js.map