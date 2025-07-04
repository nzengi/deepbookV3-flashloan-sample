#!/usr/bin/env node

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log("🚀 DeepBook v3 Flash Loan Arbitrage Bot");
console.log("=====================================");

// Check if TypeScript is compiled
if (!fs.existsSync("./dist/index.js")) {
  console.log("📦 Compiling TypeScript...");
  const tsc = spawn("npx", ["tsc"], { stdio: "inherit" });

  tsc.on("close", (code) => {
    if (code === 0) {
      console.log("✅ TypeScript compilation successful");
      startBot();
    } else {
      console.error("❌ TypeScript compilation failed");
      process.exit(1);
    }
  });
} else {
  startBot();
}

function startBot() {
  console.log("🤖 Starting Arbitrage Bot...");

  // Check if .env file exists
  if (!fs.existsSync(".env")) {
    console.log("⚠️  .env dosyası bulunamadı!");
    console.log(
      "📋 Lütfen .env.example dosyasını .env olarak kopyalayın ve yapılandırın:"
    );
    console.log("   - PRIVATE_KEY: Sui cüzdan private key'inizi girin");
    console.log("   - WALLET_ADDRESS: Sui cüzdan adresinizi girin");
    console.log("");
    console.log(
      "💡 Ödeme adresi önceden yapılandırılmıştır: 0x3f350562c0151db2394cb9813e987415bca1ef3826287502ce58382f6129f953"
    );
    process.exit(1);
  }

  // Print mainnet config for verification
  require("dotenv").config();
  console.log("SUI_RPC_URL:", process.env.SUI_RPC_URL);
  console.log("SUI_WS_URL:", process.env.SUI_WS_URL);
  console.log("NETWORK:", process.env.NETWORK);
  console.log("WALLET_ADDRESS:", process.env.WALLET_ADDRESS);

  // Start the bot
  const bot = spawn("node", ["dist/index.js"], {
    stdio: "inherit",
    env: { ...process.env },
  });

  bot.on("close", (code) => {
    console.log(`Bot çıkış kodu: ${code}`);
  });

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n🛑 Bot kapatılıyor...");
    bot.kill("SIGINT");
  });

  process.on("SIGTERM", () => {
    console.log("\n🛑 Bot kapatılıyor...");
    bot.kill("SIGTERM");
  });
}
