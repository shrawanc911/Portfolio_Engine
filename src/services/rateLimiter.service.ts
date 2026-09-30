import { redis } from "../config/redis";
import { createCronLogger } from "../utils/logger";

const logger = createCronLogger("rate-limiter");

/**
 * Rate Limiter Service for Dhan API
 * Implements sliding window algorithm with 5 requests per second limit
 * Uses queuing to ensure all requests eventually complete (no rejection)
 */
class RateLimiterService {
    private readonly maxRequests: number = 5;
    private readonly windowMs: number = 1000; // 1 second window
    private readonly redisKey: string = "dhan:rate:timestamps";

    // Queue for pending requests
    private queue: Array<{
        execute: () => Promise<any>;
        resolve: (value: any) => void;
        reject: (error: any) => void;
    }> = [];

    private isProcessing: boolean = false;

    /**
     * Execute a function with rate limiting
     * If rate limit is reached, the request is queued and executed when a slot opens
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push({
                execute: fn,
                resolve,
                reject,
            });

            this.processQueue();
        });
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;

        while (this.queue.length > 0) {
            const canProceed = await this.tryAcquireSlot();

            if (canProceed) {
                const item = this.queue.shift()!;

                // Execute without awaiting to allow parallel execution up to rate limit
                this.executeItem(item);
            } else {
                // Wait until next slot is available
                const waitTime = await this.getWaitTime();
                logger.debug(`Rate limit reached, waiting ${waitTime}ms`);
                await this.delay(waitTime);
            }
        }

        this.isProcessing = false;
    }

    private async executeItem(item: typeof this.queue[0]): Promise<void> {
        try {
            const result = await item.execute();
            item.resolve(result);
        } catch (error) {
            item.reject(error);
        }
    }

    /**
     * Try to acquire a slot in the rate limit window
     * Returns true if a slot was acquired, false if rate limit is hit
     */
    private async tryAcquireSlot(): Promise<boolean> {
        const now = Date.now();
        const windowStart = now - this.windowMs;

        try {
            // Use Redis transaction to atomically check and add timestamp
            const multi = redis.multi();

            // Remove timestamps outside the current window
            multi.zremrangebyscore(this.redisKey, 0, windowStart);

            // Count current requests in window
            multi.zcard(this.redisKey);

            const results = await multi.exec();

            if (!results) {
                // Redis error, allow the request to proceed
                logger.warn("Redis transaction failed, allowing request");
                return true;
            }

            const currentCount = results[1]?.[1] as number || 0;

            if (currentCount < this.maxRequests) {
                // Add current timestamp to the set
                await redis.zadd(this.redisKey, now, `${now}-${Math.random()}`);

                // Set expiry on the key to prevent memory leak
                await redis.expire(this.redisKey, 2);

                return true;
            }

            return false;
        } catch (error) {
            logger.error("Rate limiter Redis error", { error });
            // On error, allow the request to proceed to avoid blocking
            return true;
        }
    }

    /**
     * Get the time to wait until the next slot is available
     */
    private async getWaitTime(): Promise<number> {
        try {
            const now = Date.now();
            const windowStart = now - this.windowMs;

            // Get the oldest timestamp in the current window
            const oldestTimestamps = await redis.zrangebyscore(
                this.redisKey,
                windowStart,
                now,
                "LIMIT",
                0,
                1
            );

            if (oldestTimestamps.length > 0 && oldestTimestamps[0]) {
                // Extract timestamp from the key (format: "timestamp-random")
                const timestampPart = oldestTimestamps[0].split("-")[0];
                if (timestampPart) {
                    const oldestTime = parseInt(timestampPart, 10);
                    const waitTime = oldestTime + this.windowMs - now + 10; // Add 10ms buffer
                    return Math.max(waitTime, 50); // Minimum 50ms wait
                }
            }

            return 50; // Default wait time
        } catch (error) {
            logger.error("Error calculating wait time", { error });
            return 200; // Default wait on error
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Get current rate limit status (for monitoring)
     */
    async getStatus(): Promise<{ currentCount: number; maxRequests: number; queueLength: number }> {
        try {
            const now = Date.now();
            const windowStart = now - this.windowMs;

            await redis.zremrangebyscore(this.redisKey, 0, windowStart);
            const currentCount = await redis.zcard(this.redisKey);

            return {
                currentCount,
                maxRequests: this.maxRequests,
                queueLength: this.queue.length,
            };
        } catch (error) {
            return {
                currentCount: 0,
                maxRequests: this.maxRequests,
                queueLength: this.queue.length,
            };
        }
    }
}

// Export singleton instance
export const rateLimiter = new RateLimiterService();
