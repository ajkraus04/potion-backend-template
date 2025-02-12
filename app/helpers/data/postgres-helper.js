import postgres from "postgres";

import { POSTGRES } from "../constants.js";
console.log(POSTGRES);

let sql = null;

const startConnection = async () => {
  if (sql == null) {
    // Hardcoded credentials for now
    // @ts-ignore
    sql = postgres(
      `postgresql://postgres:potionalpha@database-2.c5wcq02eu419.us-east-1.rds.amazonaws.com:5432/postgres`,
      {
        prepare: false,
        connect_timeout: 12,
        ssl: {
          rejectUnauthorized: false,
        },
      }
    );
  }
};

const getOneByID = async (tableName, data, idName = "id") => {
  try {
    let result = await sql`
            SELECT *
            FROM ${sql(tableName)}
            ${
              data[idName] ? sql`where ${sql(idName)} = ${data[idName]}` : sql``
            }
            `;
    return result[0];
  } catch (e) {
    console.error(e);
    return null;
  }
};

const selectMany = async (query) => {
  try {
    let result = await query;
    return result;
  } catch (e) {
    console.error(e);
    return null;
  }
};

const selectOne = async (query) => {
  try {
    let result = await query;
    return result[0];
  } catch (e) {
    console.error(e);
    return null;
  }
};

const insertOne = async (
  tableName,
  data,
  values,
  logError = false,
  idName = "id"
) => {
  try {
    let result = await sql`
            INSERT INTO ${sql(tableName)} ${sql(data, values)} 
            RETURNING ${sql(idName)}`;
    return result[0][idName];
  } catch (e) {
    if (logError) {
      console.error(e);
    }
    return null;
  }
};

const insertMany = async (tableName, data) => {
  try {
    let result = await sql`
            INSERT INTO ${sql(tableName)} ${sql(data)} 
            RETURNING id`;
    return result;
  } catch (e) {
    console.error(e);
    return null;
  }
};

const upsertOne = async (tableName, data, values) => {
  try {
    let result = await sql`
            INSERT INTO ${sql(tableName)} ${sql(data, values)}
            ON CONFLICT (normalized) DO UPDATE SET normalized=EXCLUDED.normalized 
            RETURNING id`;
    return result[0].id;
  } catch (e) {
    console.error(e);
    return null;
  }
};

const updateOne = async (tableName, id, data, values, idName = "id") => {
  try {
    await sql`
            UPDATE ${sql(tableName)} 
            SET ${sql(data, values)}
            WHERE ${sql(idName)} = ${id}`;
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
};

const endConnection = async () => {
  if (sql != null) {
    await sql.end();
    sql = null;
  }
};

const testConnection = async () => {
  try {
    await startConnection();
    const result = await sql`SELECT 1`;
    console.log("Database connected successfully!");
    return true;
  } catch (error) {
    console.error("Database connection failed:", error);
    return false;
  }
};

export {
  sql,
  startConnection,
  endConnection,
  testConnection,
  getOneByID,
  insertOne,
  insertMany,
  updateOne,
  selectOne,
  selectMany,
  upsertOne,
};
