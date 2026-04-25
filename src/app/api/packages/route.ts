import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

const CONFIG_PATH = path.join(process.cwd(), "public", "uploads", "packages", "config.json");

export async function GET() {
  try {
    const data = await fs.readFile(CONFIG_PATH, "utf-8");
    return NextResponse.json(JSON.parse(data));
  } catch {
    return NextResponse.json({});
  }
}
