import type { NextRequest } from "next/server";
import { env } from "@/lib/config";

export function checkCronAuth(req: NextRequest): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return true; // not configured — allow (local dev)
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
