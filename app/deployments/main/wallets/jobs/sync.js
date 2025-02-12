import _ from "lodash";
import fs, { readFileSync } from "fs";
import { getApp, parameterTypes } from "../../../../helpers/api.js";
import { WALLETS } from "../../../../helpers/constants.js";
import { Dexscreener } from "../../../../services/dexscreener.js";
import { Birdeye } from "../../../../services/birdeye.js";
import { HeliusRpc } from "../../../../services/heliusRpc.js";
import { writeFileSync } from "fs";

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

    const solPrice = await birdeye.getTokenPrice(SOL_MINT_ADDRESS);

    const trades = await processTransactions(txs, wallet, solPrice);

    // Write trades per wallet to json file
    fs.writeFileSync(`trades_${wallet}.json`, JSON.stringify(trades, null, 2));
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
  const timestamp = transaction.transaction.timestamp;

  let tokenAddress = "";
  let tokenName = "";
  let firstTrade = timestamp;
  let lastTrade = timestamp;
  let buys = 0;
  let sells = 0;
  let investedSol = 0;
  let realizedPnl = 0;

  // Identify token and track first/last trade timestamps
  if (tokenTransfers.length < 1) {
    return;
  }

  tokenAddress = tokenTransfers[0].mint;
  tokenName = await dexscreener.getTokenName(tokenAddress);

  // Track buys and sells
  tokenTransfers.forEach((transfer) => {
    if (transfer.toUserAccount === wallet) {
      buys++;
    } else if (transfer.fromUserAccount === wallet) {
      sells++;
    }
  });

  // Track SOL investment and potential profits
  nativeTransfers.forEach((transfer) => {
    if (tokenTransfers[0].fromUserAccount === transfer.toUserAccount) {
      if (buys > 0) {
        // Only track investment on buys
        investedSol += transfer.amount;
      } else if (sells > 0) {
        // Calculate realized PNL on sells
        realizedPnl += transfer.amount;
      }
    }
  });

  if (investedSol < 0) {
    return;
  }

  // Calculate ROI only on sells
  const roi =
    sells > 0 && investedSol > 0
      ? ((realizedPnl - investedSol) / investedSol) * 100
      : 0;

  if (!trades[tokenAddress]) {
    trades[tokenAddress] = {
      token_name: tokenName,
      token_address: tokenAddress,
      first_trade: new Date(firstTrade * 1000).toISOString(),
      last_trade: new Date(lastTrade * 1000).toISOString(),
      buys,
      sells,
      invested_sol: investedSol / 1e9,
      invested_sol_usd: (investedSol / 1e9) * solPriceUSD,
      realized_pnl: 0,
      realized_pnl_usd: 0,
      roi: 0,
    };
  } else {
    trades[tokenAddress].buys += buys;
    trades[tokenAddress].sells += sells;
    trades[tokenAddress].invested_sol += investedSol / 1e9;
    trades[tokenAddress].invested_sol_usd =
      trades[tokenAddress].invested_sol * solPriceUSD;

    if (sells > 0) {
      trades[tokenAddress].realized_pnl += realizedPnl / 1e9;
      trades[tokenAddress].realized_pnl_usd =
        trades[tokenAddress].realized_pnl * solPriceUSD;
      trades[tokenAddress].roi =
        (trades[tokenAddress].realized_pnl /
          trades[tokenAddress].invested_sol) *
        100;
    }

    if (
      firstTrade <
      new Date(trades[tokenAddress].first_trade).getTime() / 1000
    ) {
      trades[tokenAddress].first_trade = new Date(
        firstTrade * 1000
      ).toISOString();
    }
    if (
      lastTrade >
      new Date(trades[tokenAddress].last_trade).getTime() / 1000
    ) {
      trades[tokenAddress].last_trade = new Date(
        lastTrade * 1000
      ).toISOString();
    }
  }
}

export { handler };
