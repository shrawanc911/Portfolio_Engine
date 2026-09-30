import { createCronLogger } from "../utils/logger";

const logger = createCronLogger("request-batcher");

/**
 * Request Batcher Service
 * Deduplicates simultaneous requests for the same stock
 * If multiple users request the same stock at the same time, only one API call is made
 */
class RequestBatcherService {
    // Map of in-flight requests: key -> Promise
    private inFlightRequests: Map<string, Promise<any>> = new Map();

    /**
     * Generate a unique key for a request
     */
    private getRequestKey(securityId: number | string, stockExchange: string): string {
        return `${securityId}:${stockExchange}`;
    }

    /**
     * Execute a fetch function with request deduplication
     * If a request for the same stock is already in-flight, wait for it instead of making a new call
     */
    async fetch<T>(
        securityId: number | string,
        stockExchange: string,
        fetchFn: () => Promise<T>
    ): Promise<T> {
        const key = this.getRequestKey(securityId, stockExchange);

        // Check if request is already in-flight
        const existingRequest = this.inFlightRequests.get(key);

        if (existingRequest) {
            logger.debug(`Request batched for ${key}, waiting for existing request`);
            return existingRequest;
        }

        // Create new request and store it
        const request = this.executeWithCleanup(key, fetchFn);
        this.inFlightRequests.set(key, request);

        return request;
    }

    /**
     * Execute the fetch function and clean up after completion
     */
    private async executeWithCleanup<T>(
        key: string,
        fetchFn: () => Promise<T>
    ): Promise<T> {
        try {
            logger.debug(`Executing request for ${key}`);
            const result = await fetchFn();
            return result;
        } finally {
            // Clean up the in-flight request after a small delay
            // This allows very close subsequent requests to still be batched
            setTimeout(() => {
                this.inFlightRequests.delete(key);
                logger.debug(`Cleaned up in-flight request for ${key}`);
            }, 100);
        }
    }

    /**
     * Check if a request is currently in-flight
     */
    isInFlight(securityId: number | string, stockExchange: string): boolean {
        const key = this.getRequestKey(securityId, stockExchange);
        return this.inFlightRequests.has(key);
    }

    /**
     * Get current number of in-flight requests
     */
    getInFlightCount(): number {
        return this.inFlightRequests.size;
    }

    /**
     * Clear all in-flight requests (use with caution, mainly for testing)
     */
    clearAll(): void {
        this.inFlightRequests.clear();
    }
}

// Export singleton instance
export const requestBatcher = new RequestBatcherService();
