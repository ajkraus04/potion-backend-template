import "dotenv/config";

// Normally go in .env
const API_KEY = "";

class Birdeye {
  baseUrl = "https://public-api.birdeye.so";
  apiKey = API_KEY;
  constructor() {}

  async getTokenPrice(address) {
    const response = await fetch(
      `${this.baseUrl}/defi/price?address=${address}`,
      {
        headers: {
          "X-API-KEY": this.apiKey,
          "x-chain": "solana",
        },
      }
    );
    const res = await response.json();
    if (res.data) {
      return res.data.value;
    }
    return null;
  }
}

export { Birdeye };
