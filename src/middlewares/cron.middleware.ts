import { Request, Response, NextFunction } from "express";

export const verifyCronSecret = (req: Request, res: Response, next: NextFunction): void => {
    const secret = process.env.CRON_SECRET;
    const providedSecret = req.headers["x-cron-secret"];

    if (!secret) {
        console.error("CRON_SECRET is not defined in pm-service.");
        res.status(500).json({ success: false, message: "Server configuration error" });
        return;
    }

    if (!providedSecret || providedSecret !== secret) {
        res.status(403).json({ success: false, message: "Forbidden: Invalid cron secret" });
        return;
    }

    next();
};
