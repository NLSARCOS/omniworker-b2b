export async function fetchWithBackoff(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let attempt = 0;
  let delay = 500; // ms

  while (attempt < maxRetries) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      if (response.status >= 500 || response.status === 429) {
        // Retryable errors
        throw new Error(`Retryable status: ${response.status}`);
      }
      return response; // Return non-retryable errors (400, 401, etc) directly
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) throw error;
      console.warn(`[Gateway Retry] URL: ${url} | Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
  throw new Error("Max retries reached");
}
