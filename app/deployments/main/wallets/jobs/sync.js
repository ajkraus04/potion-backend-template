import _ from "lodash";
import { getApp, parameterTypes } from "../../../../helpers/api";
import { WALLETS } from "../../../../helpers/constants";
import { Dexscreener } from "../../../../services/dexscreener";
import { Birdeye } from "../../../../services/birdeye";
import { HeliusRpc } from "../../../../services/heliusRpc";

const config = {
  type: parameterTypes.none,
  unknownParameters: true,
  connectToDatabase: true,
};

// Initialize services
const dexscreener = new Dexscreener();
const birdeye = new Birdeye(process.env.BIRDEYE_API_KEY);
const heliusRpc = new HeliusRpc();

const handler = getApp(async () => {
  for (const wallet of WALLETS) {
    const txs = await heliusRpc.getTransactionDetails(wallet);
    console.log(txs.length);
  }

  console.log(txs.length);
}, config);

export { handler };
