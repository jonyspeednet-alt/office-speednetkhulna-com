import { NextResponse } from "next/server";
import { readFacebookSyncDebug } from "@/lib/facebookDebug";

export async function GET() {
  const debug = await readFacebookSyncDebug();

  return NextResponse.json({
    ok: true,
    debug,
  });
}
