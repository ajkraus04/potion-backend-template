import _ from "lodash";
import fs, { readFileSync } from "fs";
import { getApp, parameterTypes } from "../../../../helpers/api.js";
import { WALLETS } from "../../../../helpers/constants.js";
import { Dexscreener } from "../../../../services/dexscreener.js";
import { Birdeye } from "../../../../services/birdeye.js";
import { HeliusRpc } from "../../../../services/heliusRpc.js";
import { writeFileSync } from "fs";
import * as Trades from "../../../../models/trades.js";

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
  const solPrice = await birdeye.getTokenPrice(SOL_MINT_ADDRESS);
  for (const wallet of WALLETS) {
    // const txs = await heliusRpc.getTransactionDetails(wallet);

    // if (txs.length > 0) {
    //   writeFileSync(
    //     `transactions_${wallet}.json`,
    //     JSON.stringify(txs, null, 2)
    //   );
    // }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const txs = JSON.parse(readFileSync(`transactions_${wallet}.json`));
    console.log("Processing", wallet, "with", txs.length, "transactions");

    const trades = await processTransactions(txs, wallet, solPrice);

    // Write trades per wallet to json file
    for (const [key, value] of Object.entries(trades)) {
      const id = `${wallet}|${key}`;

      const existingTrade = await Trades.read(id);
      console.log(existingTrade);
      if (existingTrade) {
        await Trades.update(id, { wallet, ...value });
      } else {
        await Trades.create({
          id,
          wallet,
          ...value,
        });
      }
    }
    console.log(
      "Processed",
      wallet,
      "with",
      Object.keys(trades).length,
      "trades"
    );
  }
}, config);

async function processTransactions(txs, wallet, solPrice) {
  const trades = {};

  for (const tx of txs) {
    const timestamp = tx.blockTime;

    const fee = tx.transaction.fee;

    // From Token
    const fromToken = tx.transaction.tokenTransfers[0];

    // Get SOL price at time of transaction
    try {
      if (tx.transaction.source !== "PUMP_FUN") {
        const fromTokenMint = fromToken.mint;
        const fromTokenAmount = fromToken.tokenAmount;

        // To Token
        const toToken = tx.transaction.tokenTransfers[1];
        const toTokenMint = toToken.mint;
        const toTokenAmount = toToken.tokenAmount;

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

          // Calculate PnL directly from total invested amount
          const pnl = toTokenAmount - trades[fromTokenMint].invested_sol;
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
      } else {
        await parsePumpFunSwap(tx, trades, solPrice, wallet);
      }
      // Wait 20ms to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 20));
    } catch (e) {
      console.log(e);
    }
  }

  return trades;
}

async function parsePumpFunSwap(transaction, trades, solPriceUSD, wallet) {
  const tokenTransfers = transaction.transaction.tokenTransfers || [];
  const nativeTransfers = transaction.transaction.nativeTransfers || [];
  const timestamp = new Date(transaction.blockTime * 1000).toISOString();

  if (tokenTransfers.length < 1) return;

  const tokenAddress = tokenTransfers[0].mint;
  const tokenName = await dexscreener.getTokenName(tokenAddress);

  let buys = 0;
  let sells = 0;
  tokenTransfers.forEach((transfer) => {
    if (transfer.toUserAccount === wallet) buys++;
    if (transfer.fromUserAccount === wallet) sells++;
  });

  const relevantTransfer = _.maxBy(nativeTransfers, "amount");
  if (!relevantTransfer) return;

  const solAmount = relevantTransfer.amount / 1e9;

  if (!trades[tokenAddress]) {
    trades[tokenAddress] = {
      token_name: tokenName,
      token_address: tokenAddress,
      first_trade: timestamp,
      last_trade: timestamp,
      buys: buys,
      sells: sells,
      invested_sol: buys > 0 ? solAmount : 0,
      invested_sol_usd: buys > 0 ? solAmount * solPriceUSD : 0,
      realized_pnl: sells > 0 ? solAmount : 0,
      realized_pnl_usd: sells > 0 ? solAmount * solPriceUSD : 0,
      roi: 0,
    };
  } else {
    trades[tokenAddress].buys += buys;
    trades[tokenAddress].sells += sells;

    if (buys > 0) {
      trades[tokenAddress].invested_sol += solAmount;
      trades[tokenAddress].invested_sol_usd =
        trades[tokenAddress].invested_sol * solPriceUSD;
    }

    if (sells > 0) {
      trades[tokenAddress].realized_pnl += solAmount;
      trades[tokenAddress].realized_pnl_usd =
        trades[tokenAddress].realized_pnl * solPriceUSD;

      if (trades[tokenAddress].invested_sol > 0) {
        trades[tokenAddress].roi = (
          (trades[tokenAddress].realized_pnl /
            trades[tokenAddress].invested_sol) *
          100
        ).toFixed(2);
      }
    }

    if (timestamp < trades[tokenAddress].first_trade) {
      trades[tokenAddress].first_trade = timestamp;
    }
    if (timestamp > trades[tokenAddress].last_trade) {
      trades[tokenAddress].last_trade = timestamp;
    }
  }
}

export { handler };
