#!/usr/bin/env node

import Logger from './utils/logger';
import { createConfig } from './config/index';
import ArbitrageBotService from './services/arbitrage-bot';
import DashboardServer from './dashboard/server';

/**
 * DeepBook v3 Flash Loan Arbitrage Bot
 * 
 * Production-ready arbitrage bot for Sui blockchain using DeepBook v3 protocol
 */
class ArbitrageBotApp {
  private botService?: ArbitrageBotService;
  private dashboardServer?: DashboardServer;
  private config = createConfig();

  /**
   * Start the application
   */
  async start(): Promise<void> {
    try {
      Logger.info('DeepBook Flash Loan Arbitrage Bot başlatılıyor...');
      Logger.info('Konfigürasyon:', {
        network: this.config.network,
        feeRecipient: this.config.feeRecipientAddress,
        strategies: this.config.strategies,
        dashboard: this.config.dashboard
      });

      // Initialize bot service
      this.botService = new ArbitrageBotService(this.config);
      
      // Start dashboard if enabled
      if (this.config.dashboard.enabled && this.botService) {
        this.dashboardServer = new DashboardServer(this.config, this.botService);
        await this.dashboardServer.start();
      }

      // Start arbitrage bot
      await this.botService.start();

      Logger.info('Sistem başarıyla başlatıldı');
      Logger.info(`Dashboard: http://localhost:${this.config.dashboard.port}`);
      Logger.info('Arbitraj fırsatları taranıyor...');

      // Setup graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      Logger.error('Uygulama başlatma hatası:', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      process.exit(1);
    }
  }

  /**
   * Stop the application gracefully
   */
  async stop(): Promise<void> {
    Logger.info('Uygulama kapatılıyor...');

    try {
      if (this.botService) {
        await this.botService.stop();
      }

      if (this.dashboardServer) {
        await this.dashboardServer.stop();
      }

      Logger.info('Uygulama başarıyla kapatıldı');
      process.exit(0);
    } catch (error) {
      Logger.error('Uygulama kapatma hatası:', { error });
      process.exit(1);
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', async () => {
      Logger.info('SIGINT signal alındı, kapatılıyor...');
      await this.stop();
    });

    // Handle SIGTERM
    process.on('SIGTERM', async () => {
      Logger.info('SIGTERM signal alındı, kapatılıyor...');
      await this.stop();
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      Logger.error('Yakalanmamış hata:', { error });
      this.stop();
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      Logger.error('İşlenmemiş promise reddi:', { reason, promise });
      this.stop();
    });
  }
}

// Main execution
if (require.main === module) {
  const app = new ArbitrageBotApp();
  app.start().catch((error) => {
    Logger.error('Uygulama başlatma başarısız:', { error });
    process.exit(1);
  });
}

export default ArbitrageBotApp;