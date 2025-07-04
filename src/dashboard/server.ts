import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import http from "http";
import path from "path";
import { Logger } from "../utils/logger";
import { BotConfig, WebSocketMessage } from "../types/index";
import ArbitrageBotService from "../services/arbitrage-bot";

/**
 * Dashboard Server
 *
 * Provides real-time monitoring interface for the arbitrage bot
 */
export class DashboardServer {
  private app: express.Application;
  private server: http.Server;
  private io: Server;
  private config: BotConfig;
  private botService: ArbitrageBotService;

  constructor(config: BotConfig, botService: ArbitrageBotService) {
    this.config = config;
    this.botService = botService;

    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, "../dashboard/public")));
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get("/api/health", (req, res) => {
      res.json({ status: "ok", timestamp: Date.now() });
    });

    // Bot status
    this.app.get("/api/status", (req, res) => {
      try {
        const status = this.botService.getStatus();
        res.json(status);
      } catch (error) {
        Logger.error("Error getting bot status", { error });
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Market prices
    this.app.get("/api/prices", (req, res) => {
      try {
        const deepbookService = this.botService.getDeepBookService();
        const prices = deepbookService.getAllPrices();
        // Return all prices directly
        const priceData = Array.from(prices.entries()).map(
          ([symbol, price]) => ({
            symbol,
            price: price.price.toString(),
            bid: price.bid.toString(),
            ask: price.ask.toString(),
            volume24h: price.volume24h.toString(),
            change24h: price.change24h.toString(),
            timestamp: price.timestamp,
          })
        );
        res.json({
          prices: priceData,
          totalPairs: priceData.length,
          lastUpdate: Date.now(),
        });
      } catch (error) {
        Logger.error("Error getting market prices", { error });
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // System metrics
    this.app.get("/api/metrics", (req, res) => {
      try {
        const metrics = this.botService.getSystemMetrics();
        res.json({
          ...metrics,
          totalProfit: metrics.totalProfit.toString(),
          totalGasCost: metrics.totalGasCost.toString(),
          currentBalance: metrics.currentBalance.toString(),
        });
      } catch (error) {
        Logger.error("Error getting system metrics", { error });
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Strategy settings
    this.app.post("/api/strategy/:strategy", (req: any, res: any) => {
      try {
        const { strategy } = req.params;
        const settings = req.body;

        if (strategy !== "triangular" && strategy !== "crossDex") {
          return res.status(400).json({ error: "Invalid strategy" });
        }

        this.botService.updateStrategy(strategy, settings);
        return res.json({ success: true });
      } catch (error) {
        Logger.error("Error updating strategy", { error });
        return res.status(500).json({ error: "Internal server error" });
      }
    });

    // Serve dashboard HTML
    this.app.get("/", (req, res) => {
      res.sendFile(path.join(__dirname, "../dashboard/public/index.html"));
    });
  }

  /**
   * Setup WebSocket for real-time updates
   */
  private setupWebSocket(): void {
    this.io.on("connection", (socket) => {
      Logger.info("Client connected to dashboard", { socketId: socket.id });

      // Send initial data
      socket.emit("status", this.botService.getStatus());
      socket.emit("metrics", this.botService.getSystemMetrics());

      socket.on("disconnect", () => {
        Logger.info("Client disconnected from dashboard", {
          socketId: socket.id,
        });
      });
    });

    // Broadcast updates every 5 seconds
    setInterval(() => {
      this.broadcastUpdates();
    }, 5000);
  }

  /**
   * Broadcast real-time updates to all connected clients
   */
  private broadcastUpdates(): void {
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
    } catch (error) {
      Logger.error("Error broadcasting updates", { error });
    }
  }

  /**
   * Send WebSocket message to all clients
   */
  sendMessage(message: WebSocketMessage): void {
    this.io.emit(message.type, message.data);
  }

  /**
   * Start the dashboard server
   */
  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.config.dashboard.port, "0.0.0.0", () => {
        Logger.info(
          `Dashboard server started on port ${this.config.dashboard.port}`
        );
        resolve();
      });
    });
  }

  /**
   * Stop the dashboard server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        Logger.info("Dashboard server stopped");
        resolve();
      });
    });
  }
}

export default DashboardServer;
