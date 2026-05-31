export async function fetchWithBackoff(url: string, options: RequestInit, maxRetries = 3, timeoutMs = 15000): Promise<Response> {
  let attempt = 0;
  let delay = 500; // ms

  while (attempt < maxRetries) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(id);

      if (response.ok) return response;
      if (response.status >= 500 || response.status === 429) {
        // Retryable errors
        throw new Error(`Retryable status: ${response.status}`);
      }
      return response; // Return non-retryable errors (400, 401, etc) directly
    } catch (error: any) {
      clearTimeout(id);
      attempt++;
      
      // If we aborted due to timeout, specify it in the error message
      const isTimeout = error.name === "AbortError";
      const errMsg = isTimeout ? `Request timed out after ${timeoutMs}ms` : (error.message || String(error));
      
      if (attempt >= maxRetries) {
        throw new Error(errMsg);
      }
      
      console.warn(`[Gateway Retry] URL: ${url} | Attempt ${attempt} failed, retrying in ${delay}ms... Error: ${errMsg}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
  throw new Error("Max retries reached");
}
