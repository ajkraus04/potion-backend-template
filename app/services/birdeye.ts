import "dotenv/config";

const API_KEY = process.env.BIRDEYE_API_KEY;

class Birdeye {
  private baseUrl: string = "https://public-api.birdeye.so";
  private apiKey: string;
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getTokenPrice(address: string) {
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
