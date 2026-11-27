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
    const upstreamResponse = await fetch(endpoint, {
      method: "POST",
      headers: headers || {},
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

    const contentType = upstreamResponse.headers.get("content-type") || "";
    const rawText = await upstreamResponse.text();

    if (contentType.includes("application/json")) {
      try {
        const jsonData = JSON.parse(rawText);
        return NextResponse.json(jsonData, { status: upstreamResponse.status });
      } catch {
        // Fallback if parsing fails despite header
      }
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
