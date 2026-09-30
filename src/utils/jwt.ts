import jwt from "jsonwebtoken";
import { ENV } from "../config/env";

const JWT_SECRET = ENV.JWT_SECRET as string;

export const generateToken = (userId: string) => {
  if (!userId) {
    return "x";
  }
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
};

export const verifyToken = (token: string) => {
  if (!token) {
    return "";
  }
  return jwt.verify(token, JWT_SECRET);
};
