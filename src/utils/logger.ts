import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = ` ${JSON.stringify(meta)}`;
    }
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'deepbook-arbitrage-bot' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'arbitrage-bot.log'),
      format: fileFormat,
      maxsize: 100 * 1024 * 1024, // 100MB
      maxFiles: 30,
      tailable: true
    }),
    
    // Separate file for errors
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 10,
      tailable: true
    }),
    
    // Separate file for trade logs
    new winston.transports.File({
      filename: path.join(logsDir, 'trades.log'),
      level: 'info',
      format: fileFormat,
      maxsize: 200 * 1024 * 1024, // 200MB
      maxFiles: 60,
      tailable: true
    })
  ]
});

// Add custom logging methods for different types of events
const Logger = {
  // Winston core methods
  error: logger.error.bind(logger),
  warn: logger.warn.bind(logger),
  info: logger.info.bind(logger),
  debug: logger.debug.bind(logger),
  
  // Custom methods
  trade: (message: string, meta?: any) => {
    logger.info(`[TRADE] ${message}`, meta);
  },
  
  arbitrage: (message: string, meta?: any) => {
    logger.info(`[ARBITRAGE] ${message}`, meta);
  },
  
  flashloan: (message: string, meta?: any) => {
    logger.info(`[FLASHLOAN] ${message}`, meta);
  },
  
  risk: (message: string, meta?: any) => {
    logger.warn(`[RISK] ${message}`, meta);
  },
  
  profit: (message: string, meta?: any) => {
    logger.info(`[PROFIT] ${message}`, meta);
  },
  
  gas: (message: string, meta?: any) => {
    logger.debug(`[GAS] ${message}`, meta);
  },
  
  performance: (message: string, meta?: any) => {
    logger.debug(`[PERFORMANCE] ${message}`, meta);
  },
  
  external: (message: string, meta?: any) => {
    logger.debug(`[EXTERNAL] ${message}`, meta);
  },
  
  security: (message: string, meta?: any) => {
    logger.warn(`[SECURITY] ${message}`, meta);
  }
};

export { Logger };
export default Logger;