import mongoose from "mongoose";
import { HttpError } from "../utils/httpError.js";

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ error: error.message, details: error.details || undefined });
    return;
  }

  if (error instanceof mongoose.Error.ValidationError) {
    res.status(400).json({ error: "Validation failed", details: error.errors });
    return;
  }

  if (error?.code === 11000) {
    res.status(409).json({ error: "Duplicate key conflict", details: error.keyValue });
    return;
  }

  // eslint-disable-next-line no-console
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
}

