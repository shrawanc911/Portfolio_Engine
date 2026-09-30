/**
 * Prometheus Metrics for PM Service
 */
import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';

const register = new client.Registry();

client.collectDefaultMetrics({
    register,
    prefix: 'nodejs_',
});

const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register],
});

const httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.001, 0.005, 0.015, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
    registers: [register],
});

const activeConnections = new client.Gauge({
    name: 'http_active_connections',
    help: 'Number of active HTTP connections',
    registers: [register],
});

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    if (req.path === '/metrics') {
        return next();
    }

    activeConnections.inc();
    const startTime = Date.now();

    res.on('finish', () => {
        const duration = (Date.now() - startTime) / 1000;
        const route = req.path || 'unknown';
        const method = req.method;
        const statusCode = res.statusCode.toString();

        httpRequestsTotal.inc({ method, route, status_code: statusCode });
        httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
        activeConnections.dec();
    });

    next();
};

export const metricsHandler = async (_req: Request, res: Response): Promise<void> => {
    try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    } catch (error) {
        res.status(500).end();
    }
};

export default { register, metricsMiddleware, metricsHandler };
