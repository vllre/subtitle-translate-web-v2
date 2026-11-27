import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { endpoint, headers, body } = await req.json();

    if (!endpoint || typeof endpoint !== "string") {
      return NextResponse.json(
        { error: { message: "Invalid or missing endpoint parameter" } },
        { status: 400 }
      );
    }

    // Forward request from server-side (bypasses browser CORS & OPTIONS preflight)
    const requestBody = typeof body === "string" ? body : JSON.stringify(body);
    const upstreamResponse = await fetch(endpoint, {
      method: "POST",
      headers: headers || {},
      body: requestBody,
    });

    const contentType = upstreamResponse.headers.get("content-type") || "";
    const rawText = await upstreamResponse.text();

    let parsedJson: any = null;
    let isJson = false;

    try {
      parsedJson = JSON.parse(rawText);
      isJson = true;
    } catch {
      isJson = false;
    }

    if (isJson) {
      return NextResponse.json(parsedJson, { status: upstreamResponse.status });
    }

    // If upstream failed or returned non-JSON, return error format so client displays rawText clearly
    if (!upstreamResponse.ok) {
      return NextResponse.json(
        {
          error: {
            message: `HTTP ${upstreamResponse.status}: ${rawText.slice(0, 500)}`,
          },
        },
        { status: upstreamResponse.status }
      );
    }

    return new NextResponse(rawText, {
      status: upstreamResponse.status,
      headers: {
        "Content-Type": contentType || "text/plain",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to proxy request";
    return NextResponse.json({ error: { message: msg } }, { status: 500 });
  }
}
