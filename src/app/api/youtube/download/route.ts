import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import os from "os";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filePathEncoded = searchParams.get("file");

  if (!filePathEncoded) {
    return NextResponse.json({ error: "File path is required" }, { status: 400 });
  }

  const filePath = decodeURIComponent(filePathEncoded);

  // Security check: ensure the requested path is inside the OS temp directory
  const tempDir = os.tmpdir();
  if (!filePath.startsWith(tempDir)) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found. It may have expired. Please try downloading again." }, { status: 404 });
  }

  try {
    const stat = fs.statSync(filePath);
    const fileStream = fs.createReadStream(filePath);

    const readableStream = new ReadableStream({
      start(controller) {
        fileStream.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
        fileStream.on("end", () => {
          controller.close();
          try { fs.unlinkSync(filePath); } catch (e) { }
        });
        fileStream.on("error", (err) => controller.error(err));
      },
    });

    const headers = new Headers();
    headers.set("Content-Type", "video/mp4");
    headers.set("Content-Length", String(stat.size));
    headers.set("Content-Disposition", `attachment; filename="${path.basename(filePath)}"`);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", "no-cache");

    console.log(`Serving file: ${path.basename(filePath)} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);

    return new NextResponse(readableStream, { status: 200, headers });
  } catch (error: any) {
    console.error("File serve error:", error);
    return NextResponse.json({ error: error.message || "Failed to serve video file" }, { status: 500 });
  }
}
