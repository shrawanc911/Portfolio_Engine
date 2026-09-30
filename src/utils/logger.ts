import { createLogger, format, transports, Logger } from "winston";

const { combine, timestamp, printf, colorize, errors } = format;

// Custom log format for better readability
const logFormat = printf(({ level, message, timestamp, service, jobName, jobId, duration, error, ...meta }) => {
    let log = `${timestamp} [${level}]`;

    if (service) log += ` [${service}]`;
    if (jobName) log += ` [Job: ${jobName}]`;
    if (jobId) log += ` [ID: ${jobId}]`;

    log += ` ${message}`;

    if (duration !== undefined) log += ` (${duration}ms)`;
    if (error) log += ` | Error: ${error}`;

    // Add any additional metadata
    const remainingMeta = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : "";
    log += remainingMeta;

    return log;
});

// JSON format for production (easier to parse in log aggregators)
const jsonFormat = printf(({ level, message, timestamp, ...meta }) => {
    return JSON.stringify({
        timestamp,
        level,
        message,
        ...meta,
    });
});

// Create the logger instance
const logger: Logger = createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: combine(
        timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        errors({ stack: true })
    ),
    defaultMeta: { service: "pm-service" },
    transports: [
        new transports.Console({
            format: combine(
                colorize(),
                process.env.NODE_ENV === "production" ? jsonFormat : logFormat
            ),
        }),
    ],
});

// Error classification types
export enum ErrorType {
    TOKEN_EXPIRED = "TOKEN_EXPIRED",
    TOKEN_INVALID = "TOKEN_INVALID",
    NETWORK_ERROR = "NETWORK_ERROR",
    RATE_LIMIT = "RATE_LIMIT",
    DATABASE_ERROR = "DATABASE_ERROR",
    VALIDATION_ERROR = "VALIDATION_ERROR",
    UNKNOWN = "UNKNOWN",
}

// Classify error based on status code and message
export const classifyError = (error: any): ErrorType => {
    if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.message || error.message || "";

        if (status === 401) {
            if (message.toLowerCase().includes("expired")) {
                return ErrorType.TOKEN_EXPIRED;
            }
            return ErrorType.TOKEN_INVALID;
        }
        if (status === 429) return ErrorType.RATE_LIMIT;
        if (status >= 500) return ErrorType.NETWORK_ERROR;
    }

    if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
        return ErrorType.NETWORK_ERROR;
    }

    if (error.name === "MongoError" || error.name === "MongooseError") {
        return ErrorType.DATABASE_ERROR;
    }

    if (error.name === "ValidationError") {
        return ErrorType.VALIDATION_ERROR;
    }

    return ErrorType.UNKNOWN;
};

// Create a child logger for cron jobs with specific context
export const createCronLogger = (serviceName: string) => {
    return logger.child({ service: serviceName });
};

// Structured job logging helper
export const logJobStart = (cronLogger: Logger, jobName: string, jobId?: string) => {
    cronLogger.info("Job started", { jobName, jobId, status: "started" });
};

export const logJobSuccess = (cronLogger: Logger, jobName: string, duration: number, jobId?: string, meta?: object) => {
    cronLogger.info("Job completed successfully", { jobName, jobId, duration, status: "success", ...meta });
};

export const logJobError = (cronLogger: Logger, jobName: string, error: any, jobId?: string) => {
    const errorType = classifyError(error);
    const errorDetails = {
        jobName,
        jobId,
        status: "failed",
        errorType,
        error: error.message,
        statusCode: error.response?.status,
        responseData: error.response?.data,
        stack: process.env.NODE_ENV !== "production" ? error.stack : undefined,
    };

    // Use different log levels based on error type
    if (errorType === ErrorType.TOKEN_EXPIRED || errorType === ErrorType.TOKEN_INVALID) {
        cronLogger.error("Job failed - Authentication error. Token needs to be refreshed manually.", errorDetails);
    } else if (errorType === ErrorType.RATE_LIMIT) {
        cronLogger.warn("Job failed - Rate limit hit. Will retry later.", errorDetails);
    } else if (errorType === ErrorType.NETWORK_ERROR) {
        cronLogger.error("Job failed - Network error. External service may be down.", errorDetails);
    } else if (errorType === ErrorType.DATABASE_ERROR) {
        cronLogger.error("Job failed - Database error.", errorDetails);
    } else {
        cronLogger.error("Job failed - Unexpected error.", errorDetails);
    }
};

export const logTokenStatus = (cronLogger: Logger, expiresAt: Date | null) => {
    if (!expiresAt) {
        cronLogger.warn("Token expiry unknown - token status could not be determined");
        return;
    }

    const now = new Date();
    const hoursUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilExpiry <= 0) {
        cronLogger.error("Token has EXPIRED", { expiresAt: expiresAt.toISOString(), hoursUntilExpiry: 0 });
    } else if (hoursUntilExpiry <= 2) {
        cronLogger.warn("Token expiring soon!", { expiresAt: expiresAt.toISOString(), hoursUntilExpiry: hoursUntilExpiry.toFixed(2) });
    } else {
        cronLogger.info("Token status OK", { expiresAt: expiresAt.toISOString(), hoursUntilExpiry: hoursUntilExpiry.toFixed(2) });
    }
};

export default logger;
