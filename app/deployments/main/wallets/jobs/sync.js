import _ from "lodash";
import fs from "fs";
import { getApp, parameterTypes } from "../../../../helpers/api.js";
import { WALLETS } from "../../../../helpers/constants.js";
import { Dexscreener } from "../../../../services/dexscreener.js";
import { Birdeye } from "../../../../services/birdeye.js";
import { HeliusRpc } from "../../../../services/heliusRpc.js";

const config = {
  type: parameterTypes.none,
  unknownParameters: true,
  connectToDatabase: true,
};

const SOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";

// Initialize services
const dexscreener = new Dexscreener();
const birdeye = new Birdeye(process.env.BIRDEYE_API_KEY);
const heliusRpc = new HeliusRpc();

const handler = getApp(async () => {
  for (const wallet of WALLETS) {
    const txs = await heliusRpc.getTransactionDetails(wallet);
    const trades = await processTransactions(txs);

    // Write trades per wallet to json file
    fs.writeFileSync(`trades_${wallet}.json`, JSON.stringify(trades, null, 2));
  }
}, config);

async function processTransactions(txs) {
  const trades = {};

  for (const tx of txs) {
    const timestamp = tx.blockTime;

    const fee = tx.transaction.fee;

    // From Token
    const fromToken = tx.transaction.tokenTransfers[0];
    const fromTokenMint = fromToken.mint;
    const fromTokenAmount = fromToken.tokenAmount;

    // To Token
    const toToken = tx.transaction.tokenTransfers[1];
    const toTokenMint = toToken.mint;
    const toTokenAmount = toToken.tokenAmount;

    // Get SOL price at time of transaction
    const solPrice = await birdeye.getTokenPrice(SOL_MINT_ADDRESS);

    if (fromTokenMint === SOL_MINT_ADDRESS) {
      // Process BUY
      if (!trades[toTokenMint]) {
        trades[toTokenMint] = {
          token_address: toTokenMint,
          token_name: await dexscreener.getTokenName(toTokenMint),
          first_trade: timestamp,
          last_trade: timestamp,
          buys: 0,
          sells: 0,
          invested_sol: 0,
          invested_sol_usd: 0,
          realized_pnl: 0,
          realized_pnl_usd: 0,
          roi: 0,
        };
      }

      trades[toTokenMint].buys++;
      trades[toTokenMint].invested_sol += fromTokenAmount;
      trades[toTokenMint].invested_sol_usd += fromTokenAmount * solPrice;
      trades[toTokenMint].last_trade = timestamp;
    } else if (toTokenMint === SOL_MINT_ADDRESS) {
      // Process SELL
      if (!trades[fromTokenMint]) {
        trades[fromTokenMint] = {
          token_address: fromTokenMint,
          token_name: await dexscreener.getTokenName(fromTokenMint),
          first_trade: timestamp,
          last_trade: timestamp,
          buys: 0,
          sells: 0,
          invested_sol: 0,
          invested_sol_usd: 0,
          realized_pnl: 0,
          realized_pnl_usd: 0,
          roi: 0,
        };
      }

      trades[fromTokenMint].sells++;
      trades[fromTokenMint].last_trade = timestamp;

      // Calculate PnL
      const soldForSol = toTokenAmount;
      const pnl = soldForSol - trades[fromTokenMint].invested_sol;
      trades[fromTokenMint].realized_pnl += pnl;
      trades[fromTokenMint].realized_pnl_usd += pnl * solPrice;

      // Calculate ROI
      if (trades[fromTokenMint].invested_sol > 0) {
        trades[fromTokenMint].roi =
          (trades[fromTokenMint].realized_pnl /
            trades[fromTokenMint].invested_sol) *
          100;
      }
    }

    // Wait 20ms to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  return trades;
}

export { handler };
