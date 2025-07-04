import BigNumber from 'bignumber.js';
import RealArbitrageService from './services/real-arbitrage';
import { createConfig } from './config/index';
import { Logger } from './utils/logger';

/**
 * Simple Arbitrage Bot
 * 
 * Basitleştirilmiş gerçek arbitrage botu
 * Sadece SUI/USDC arbitrage'ına odaklanır
 */
class SimpleArbitrageBot {
  private realArbitrageService: RealArbitrageService;
  private isRunning: boolean = false;
  private totalTrades: number = 0;
  private successfulTrades: number = 0;
  private totalProfit: BigNumber = new BigNumber(0);

  constructor() {
    const config = createConfig();
    this.realArbitrageService = new RealArbitrageService(config);
    
    Logger.info('Simple Arbitrage Bot initialized');
    Logger.info(`Fee recipient: ${config.feeRecipientAddress}`);
  }

  /**
   * Bot'u başlat
   */
  async start(): Promise<void> {
    Logger.info('🚀 Starting Simple Arbitrage Bot...');
    this.isRunning = true;

    // Ana arbitrage döngüsünü başlat
    this.startArbitrageLoop();
    
    // Durum raporlamasını başlat
    this.startStatusReporting();

    Logger.info('✅ Simple Arbitrage Bot started successfully');
  }

  /**
   * Bot'u durdur
   */
  async stop(): Promise<void> {
    Logger.info('⏹️ Stopping Simple Arbitrage Bot...');
    this.isRunning = false;
  }

  /**
   * Ana arbitrage döngüsü
   */
  private startArbitrageLoop(): void {
    const scan = async () => {
      if (!this.isRunning) return;

      try {
        // Arbitrage fırsatlarını tara
        const opportunities = await this.realArbitrageService.scanOpportunities();

        if (opportunities.length > 0) {
          Logger.arbitrage(`🔍 Found ${opportunities.length} arbitrage opportunities`);

          // En iyi fırsatı seç ve çalıştır
          const bestOpportunity = opportunities[0];
          await this.executeOpportunity(bestOpportunity);
        }

      } catch (error) {
        Logger.error('Error in arbitrage loop', { error });
      }

      // 3 saniye bekle ve tekrar tara
      setTimeout(scan, 3000);
    };

    scan();
  }

  /**
   * Arbitrage fırsatını çalıştır
   */
  private async executeOpportunity(opportunity: any): Promise<void> {
    this.totalTrades++;

    try {
      Logger.flashloan(`💰 Executing arbitrage opportunity`, {
        id: opportunity.id,
        expectedProfit: opportunity.expectedProfit.toFixed(4) + ' USD',
        amount: opportunity.amount.toFixed(2) + ' SUI'
      });

      const result = await this.realArbitrageService.executeArbitrage(opportunity);

      if (result.success) {
        this.successfulTrades++;
        this.totalProfit = this.totalProfit.plus(result.actualProfit || 0);

        Logger.profit(`✅ Arbitrage successful!`, {
          profit: result.actualProfit?.toFixed(4) + ' USD',
          executionTime: result.executionTime + 'ms',
          txHash: result.txHash
        });
      } else {
        Logger.error(`❌ Arbitrage failed: ${result.error}`);
      }

    } catch (error) {
      Logger.error('Error executing arbitrage opportunity', { error });
    }
  }

  /**
   * Durum raporlaması
   */
  private startStatusReporting(): void {
    const report = () => {
      if (!this.isRunning) return;

      const successRate = this.totalTrades > 0 
        ? (this.successfulTrades / this.totalTrades * 100).toFixed(1)
        : '0.0';

      Logger.info(`📊 Bot Status:`, {
        totalTrades: this.totalTrades,
        successfulTrades: this.successfulTrades,
        successRate: successRate + '%',
        totalProfit: this.totalProfit.toFixed(4) + ' USD',
        running: this.isRunning ? '✅' : '❌'
      });

      setTimeout(report, 60000); // Her dakika rapor et
    };

    setTimeout(report, 60000); // İlk raporu 1 dakika sonra ver
  }

  /**
   * Bot istatistikleri
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      totalTrades: this.totalTrades,
      successfulTrades: this.successfulTrades,
      successRate: this.totalTrades > 0 ? this.successfulTrades / this.totalTrades : 0,
      totalProfit: this.totalProfit,
      arbitrageStats: this.realArbitrageService.getStats()
    };
  }
}

// Bot'u başlat
async function main() {
  const bot = new SimpleArbitrageBot();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n⏹️ Shutting down bot...');
    await bot.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n⏹️ Shutting down bot...');
    await bot.stop();
    process.exit(0);
  });

  try {
    await bot.start();
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Bot crashed:', error);
    process.exit(1);
  });
}

export default SimpleArbitrageBot;