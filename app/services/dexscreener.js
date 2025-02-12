class Dexscreener {
  baseUrl = "https://api.dexscreener.com/";

  async fetchWithRetry(url, options = {}, attempt = 1) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429 && attempt <= 3) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.fetchWithRetry(url, options, attempt + 1);
      }
      return response;
    } catch (error) {
      if (attempt <= 3) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.fetchWithRetry(url, options, attempt + 1);
      }
      throw error;
    }
  }

  async getTokenName(address) {
    const response = await this.fetchWithRetry(
      `${this.baseUrl}/tokens/v1/solana/${address}`
    );
    const data = await response.json();

    if (!data.length) {
      return null;
    }

    if (data[0].baseToken) {
      return data[0].baseToken.name;
    }
    return null;
  }
}

export { Dexscreener };
