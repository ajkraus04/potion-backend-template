import "dotenv/config";

const API_KEY = process.env.BIRDEYE_API_KEY;

class Birdeye {
  baseUrl = "https://public-api.birdeye.so";
  apiKey = API_KEY;
  constructor() {}

  async getTokenPrice(address) {
    console.log(address);
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
