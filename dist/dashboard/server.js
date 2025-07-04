"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardServer = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const socket_io_1 = require("socket.io");
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const logger_1 = require("../utils/logger");
class DashboardServer {
    constructor(config, botService) {
        this.config = config;
        this.botService = botService;
        this.app = (0, express_1.default)();
        this.server = http_1.default.createServer(this.app);
        this.io = new socket_io_1.Server(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"],
            },
        });
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
    }
    setupMiddleware() {
        this.app.use((0, cors_1.default)());
        this.app.use(express_1.default.json());
        this.app.use(express_1.default.static(path_1.default.join(__dirname, "../dashboard/public")));
    }
    setupRoutes() {
        this.app.get("/api/health", (req, res) => {
            res.json({ status: "ok", timestamp: Date.now() });
        });
        this.app.get("/api/status", (req, res) => {
            try {
                const status = this.botService.getStatus();
                res.json(status);
            }
            catch (error) {
                logger_1.Logger.error("Error getting bot status", { error });
                res.status(500).json({ error: "Internal server error" });
            }
        });
        this.app.get("/api/prices", (req, res) => {
            try {
                const deepbookService = this.botService.getDeepBookService();
                const prices = deepbookService.getAllPrices();
                const priceData = Array.from(prices.entries()).map(([symbol, price]) => ({
                    symbol,
                    price: price.price.toString(),
                    bid: price.bid.toString(),
                    ask: price.ask.toString(),
                    volume24h: price.volume24h.toString(),
                    change24h: price.change24h.toString(),
                    timestamp: price.timestamp,
                }));
                res.json({
                    prices: priceData,
                    totalPairs: priceData.length,
                    lastUpdate: Date.now(),
                });
            }
            catch (error) {
                logger_1.Logger.error("Error getting market prices", { error });
                res.status(500).json({ error: "Internal server error" });
            }
        });
        this.app.get("/api/metrics", (req, res) => {
            try {
                const metrics = this.botService.getSystemMetrics();
                res.json({
                    ...metrics,
                    totalProfit: metrics.totalProfit.toString(),
                    totalGasCost: metrics.totalGasCost.toString(),
                    currentBalance: metrics.currentBalance.toString(),
                });
            }
            catch (error) {
                logger_1.Logger.error("Error getting system metrics", { error });
                res.status(500).json({ error: "Internal server error" });
            }
        });
        this.app.post("/api/strategy/:strategy", (req, res) => {
            try {
                const { strategy } = req.params;
                const settings = req.body;
                if (strategy !== "triangular" && strategy !== "crossDex") {
                    return res.status(400).json({ error: "Invalid strategy" });
                }
                this.botService.updateStrategy(strategy, settings);
                return res.json({ success: true });
            }
            catch (error) {
                logger_1.Logger.error("Error updating strategy", { error });
                return res.status(500).json({ error: "Internal server error" });
            }
        });
        this.app.get("/", (req, res) => {
            res.sendFile(path_1.default.join(__dirname, "../dashboard/public/index.html"));
        });
    }
    setupWebSocket() {
        this.io.on("connection", (socket) => {
            logger_1.Logger.info("Client connected to dashboard", { socketId: socket.id });
            socket.emit("status", this.botService.getStatus());
            socket.emit("metrics", this.botService.getSystemMetrics());
            socket.on("disconnect", () => {
                logger_1.Logger.info("Client disconnected from dashboard", {
                    socketId: socket.id,
                });
            });
        });
        setInterval(() => {
            this.broadcastUpdates();
        }, 5000);
    }
    broadcastUpdates() {
        try {
            const status = this.botService.getStatus();
            const metrics = this.botService.getSystemMetrics();
            this.io.emit("status", status);
            this.io.emit("metrics", {
                ...metrics,
                totalProfit: metrics.totalProfit.toString(),
                totalGasCost: metrics.totalGasCost.toString(),
                currentBalance: metrics.currentBalance.toString(),
            });
        }
        catch (error) {
            logger_1.Logger.error("Error broadcasting updates", { error });
        }
    }
    sendMessage(message) {
        this.io.emit(message.type, message.data);
    }
    start() {
        return new Promise((resolve) => {
            this.server.listen(this.config.dashboard.port, "0.0.0.0", () => {
                logger_1.Logger.info(`Dashboard server started on port ${this.config.dashboard.port}`);
                resolve();
            });
        });
    }
    stop() {
        return new Promise((resolve) => {
            this.server.close(() => {
                logger_1.Logger.info("Dashboard server stopped");
                resolve();
            });
        });
    }
}
exports.DashboardServer = DashboardServer;
exports.default = DashboardServer;
//# sourceMappingURL=server.js.map