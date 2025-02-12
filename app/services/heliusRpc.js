import { Connection, PublicKey } from "@solana/web3.js";
import { writeFileSync } from "fs";

const API_KEY = process.env.HELIUS_API_KEY;
console.log(API_KEY);

// Helius RPC URL
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${API_KEY}`;

class HeliusRpc {
  constructor() {
    this.connection = new Connection(RPC_URL);
  }

  async getConfirmedSignatures(walletAddress) {
    const publicKey = new PublicKey(walletAddress);
    const THIRTY_DAYS_AGO = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;

    let allSignatures = [];
    let before = undefined;

    while (true) {
      const signatures = await this.connection.getSignaturesForAddress(
        publicKey,
        { limit: 1000, before }
      );

      if (signatures.length === 0) break;

      allSignatures.push(...signatures);

      const oldestTx = signatures[signatures.length - 1];
      console.log(oldestTx.blockTime);
      if (!oldestTx.blockTime || oldestTx.blockTime < THIRTY_DAYS_AGO) {
        break;
      }

      before = oldestTx.signature;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const recentTxs = allSignatures.filter(
      (sig) => sig.blockTime && sig.blockTime >= THIRTY_DAYS_AGO
    );

    return recentTxs;
  }

  async getTransactionDetails(walletAddress) {
    const signatures = await this.getConfirmedSignatures(walletAddress);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const BATCH_SIZE = 100;
    const CONCURRENT_BATCHES = 2;
    const results = [];
    const parseUrl = `https://api.helius.xyz/v0/transactions/?api-key=${API_KEY}`;

    for (
      let i = 0;
      i < signatures.length;
      i += BATCH_SIZE * CONCURRENT_BATCHES
    ) {
      const batchPromises = Array.from(
        { length: CONCURRENT_BATCHES },
        async (_, j) => {
          const start = i + j * BATCH_SIZE;
          const batch = signatures.slice(start, start + BATCH_SIZE);
          if (batch.length === 0) return [];

          try {
            const response = await fetch(parseUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                transactions: batch.map((sig) => sig.signature),
              }),
            });

            const parsedTxs = await response.json();
            // Check if parsedTxs exists and has valid data
            if (
              !Array.isArray(parsedTxs) ||
              parsedTxs.length !== batch.length
            ) {
              console.error("Invalid parsed transactions response:", parsedTxs);
              return [];
            }

            return batch
              .map((sig, index) => {
                if (!parsedTxs[index]) {
                  console.warn(
                    `Missing transaction data for signature ${sig.signature}`
                  );
                }
                return {
                  signature: sig.signature,
                  blockTime: sig.blockTime ?? null,
                  transaction: parsedTxs[index],
                };
              })
              .filter(Boolean);
          } catch (error) {
            console.error("Failed to parse transactions:", error);
            return [];
          }
        }
      );

      const batchResults = await Promise.all(batchPromises);
      const filteredBatchResults = batchResults
        .flat()
        .filter(
          (tx) => tx.transaction !== null && tx.transaction.type === "SWAP"
        );

      results.push(...filteredBatchResults);

      // Write current batch to file
      if (filteredBatchResults.length > 0) {
        const filename = `transactions_${walletAddress}_batch_${i}.json`;
        writeFileSync(filename, JSON.stringify(filteredBatchResults, null, 2));
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    return results.filter(
      (tx) => tx.transaction !== null && tx.transaction.type === "SWAP"
    );
  }
}

export { HeliusRpc };
