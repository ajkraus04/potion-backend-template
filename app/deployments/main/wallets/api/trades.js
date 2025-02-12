import _ from "lodash";
import Joi from "joi";
import * as Trades from "../../../../models/trades.js";
import {
  getApp,
  parameterTypes,
  response200,
} from "../../../../helpers/api.js";
import * as Postgres from "../../../../helpers/data/postgres-helper.js";
const config = {
  type: parameterTypes.query,
  unknownParameters: true,
  connectToDatabase: true,
  validator: Joi.object({
    wallet: Joi.string(),
    sortBy: Joi.string().valid("created_at", "realized_pnl_usd").optional(),
    sortDirection: Joi.string().valid("ASC", "DESC").optional(),
  }),
};

const handler = getApp(async (event) => {
  const {
    wallet,
    sortBy = "created_at",
    sortDirection = "DESC",
  } = event.validData;

  console.log(event.validData);
  await Postgres.testConnection();

  const trades = await Trades.searchByWallet(wallet, sortBy, sortDirection);

  return response200({
    trades: trades,
  });
}, config);

export { handler };
