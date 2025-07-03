"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const winston_1 = __importDefault(require("winston"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const logsDir = path_1.default.join(process.cwd(), 'logs');
if (!fs_1.default.existsSync(logsDir)) {
    fs_1.default.mkdirSync(logsDir, { recursive: true });
}
const consoleFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.colorize(), winston_1.default.format.printf(({ level, message, timestamp, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
        metaStr = ` ${JSON.stringify(meta)}`;
    }
    return `${timestamp} [${level}]: ${message}${metaStr}`;
}));
const fileFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json());
const logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: { service: 'deepbook-arbitrage-bot' },
    transports: [
        new winston_1.default.transports.Console({
            format: consoleFormat
        }),
        new winston_1.default.transports.File({
            filename: path_1.default.join(logsDir, 'arbitrage-bot.log'),
            format: fileFormat,
            maxsize: 100 * 1024 * 1024,
            maxFiles: 30,
            tailable: true
        }),
        new winston_1.default.transports.File({
            filename: path_1.default.join(logsDir, 'error.log'),
            level: 'error',
            format: fileFormat,
            maxsize: 50 * 1024 * 1024,
            maxFiles: 10,
            tailable: true
        }),
        new winston_1.default.transports.File({
            filename: path_1.default.join(logsDir, 'trades.log'),
            level: 'info',
            format: fileFormat,
            maxsize: 200 * 1024 * 1024,
            maxFiles: 60,
            tailable: true
        })
    ]
});
exports.Logger = {
    ...logger,
    trade: (message, meta) => {
        logger.info(`[TRADE] ${message}`, meta);
    },
    arbitrage: (message, meta) => {
        logger.info(`[ARBITRAGE] ${message}`, meta);
    },
    flashloan: (message, meta) => {
        logger.info(`[FLASHLOAN] ${message}`, meta);
    },
    risk: (message, meta) => {
        logger.warn(`[RISK] ${message}`, meta);
    },
    profit: (message, meta) => {
        logger.info(`[PROFIT] ${message}`, meta);
    },
    gas: (message, meta) => {
        logger.debug(`[GAS] ${message}`, meta);
    },
    performance: (message, meta) => {
        logger.debug(`[PERFORMANCE] ${message}`, meta);
    },
    external: (message, meta) => {
        logger.debug(`[EXTERNAL] ${message}`, meta);
    },
    security: (message, meta) => {
        logger.warn(`[SECURITY] ${message}`, meta);
    }
};
exports.default = exports.Logger;
//# sourceMappingURL=logger.js.map