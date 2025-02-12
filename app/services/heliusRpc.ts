import { ConfirmedSignatureInfo, Connection, PublicKey } from "@solana/web3.js";

const API_KEY = process.env.HELIUS_API_KEY;

// Helius RPC URL
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${API_KEY}`;

interface TransactionResult {
  signature: string;
  blockTime: number | null;
  transaction: any;
}

class HeliusRpc {
  private connection: Connection;

  constructor() {
    this.connection = new Connection(RPC_URL);
  }

  private async getConfirmedSignatures(walletAddress: string) {
    const publicKey = new PublicKey(walletAddress);
    const THIRTY_DAYS_AGO = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;

    let allSignatures: ConfirmedSignatureInfo[] = [];
    let before: string | undefined = undefined;

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
    }

    const recentTxs = allSignatures.filter(
      (sig) => sig.blockTime && sig.blockTime >= THIRTY_DAYS_AGO
    );

    return recentTxs;
  }

  public async getTransactionDetails(
    walletAddress: string
  ): Promise<TransactionResult[]> {
    const signatures = await this.getConfirmedSignatures(walletAddress);
    const BATCH_SIZE = 1;
    const results: TransactionResult[] = [];

    for (let i = 0; i < signatures.length; i += BATCH_SIZE) {
      const batch = signatures.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (sig) => {
          const tx = await this.connection.getParsedTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
          });
          return {
            signature: sig.signature,
            blockTime: sig.blockTime ?? null,
            transaction: tx,
          };
        })
      );
      results.push(...batchResults);
      await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay between batches
    }

    return results.filter((tx) => tx.transaction !== null);
  }
}

export { HeliusRpc };

const heliusRpc = new HeliusRpc();

const txs = await heliusRpc.getTransactionDetails(
  "AbcX4XBm7DJ3i9p29i6sU8WLmiW4FWY5tiwB9D6UBbcE"
);
console.log(txs.length);
console.log(txs[0]);
