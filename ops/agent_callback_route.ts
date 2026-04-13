import { NextRequest, NextResponse } from "next/server";
import { env, hasFacebookConfig } from "@/lib/env";
import { writeFacebookSyncDebug } from "@/lib/facebookDebug";
import { exchangeCodeForUserAccessToken, syncFacebookUserPages } from "@/lib/facebook";

export async function GET(request: NextRequest) {
  if (!hasFacebookConfig()) {
    return NextResponse.redirect(
      new URL("/?error=missing-facebook-config", env.appUrl),
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error_message");

  if (error) {
    await writeFacebookSyncDebug({
      timestamp: new Date().toISOString(),
      stage: "callback-facebook-error-param",
      appUrl: env.appUrl,
      redirectUri: env.facebookRedirectUri,
      error,
    });

    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(error)}`, env.appUrl),
    );
  }

  if (!code) {
    await writeFacebookSyncDebug({
      timestamp: new Date().toISOString(),
      stage: "callback-missing-code",
      appUrl: env.appUrl,
      redirectUri: env.facebookRedirectUri,
      error: "Missing code in callback request.",
    });

    return NextResponse.redirect(new URL("/?error=missing-code", env.appUrl));
  }

  try {
    const accessToken = await exchangeCodeForUserAccessToken(code);
    await syncFacebookUserPages(accessToken);

    return NextResponse.redirect(new URL("/?connected=facebook", env.appUrl));
  } catch (callbackError) {
    const message =
      callbackError instanceof Error ? callbackError.message : "Facebook callback failed";

    await writeFacebookSyncDebug({
      timestamp: new Date().toISOString(),
      stage: "callback-exception",
      appUrl: env.appUrl,
      redirectUri: env.facebookRedirectUri,
      error: message,
    });

    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(message)}`, env.appUrl),
    );
  }
}
