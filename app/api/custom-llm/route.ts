import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function formatHtmlErrorMessage(status: number): string {
  if (status === 524) {
    return "HTTP 524: Upstream server timed out (Cloudflare 524). Try reducing batch size or using a faster model.";
  }
  return `HTTP ${status}: The server returned an HTML page — check your API Base URL or server status.`;
}

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

    // Pipe SSE streams directly so chunks reach the client incrementally and avoid proxy timeouts
    if (
      upstreamResponse.ok &&
      contentType.toLowerCase().includes("text/event-stream") &&
      upstreamResponse.body
    ) {
      return new NextResponse(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

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

    // If upstream failed or returned non-JSON, return a clean error message
    if (!upstreamResponse.ok) {
      const trimmed = rawText.trimStart().toLowerCase();
      const isHtml = trimmed.startsWith("<!doctype") || trimmed.startsWith("<html");
      const message = isHtml
        ? formatHtmlErrorMessage(upstreamResponse.status)
        : `HTTP ${upstreamResponse.status}: ${rawText.slice(0, 500)}`;

      return NextResponse.json(
        { error: { message } },
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
