import { NextResponse, NextRequest } from "next/server";
import { makeErrorResponse, makeSuccessResponse } from "@/lib/http";
import { VideoInfo } from "@/types";
import path from "path";
import fs from "fs";
import os from "os";
import { spawn } from "child_process";

// Extract video ID from various YouTube URL formats 
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!url) {
    return NextResponse.json(makeErrorResponse("YouTube URL is required"), { status: 400 });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return NextResponse.json(makeErrorResponse("Invalid YouTube URL - could not extract video ID"), { status: 400 });
  }

  try {
    // Create a temporary directory and define output file path
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "yt-download-"));
    const outputPath = path.join(tmpDir, `${videoId}.mp4`);

    // Run yt-dlp to download best video + best audio and merge to mp4
    const args = [
      "-f",
      "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
      "--merge-output-format",
      "mp4",
      "-o",
      outputPath,
      `https://www.youtube.com/watch?v=${videoId}`,
    ];
    await new Promise((resolve, reject) => {
      const proc = spawn("yt-dlp", args, { stdio: "ignore" });
      proc.on("error", reject);
      proc.on("close", code => (code === 0 ? resolve(null) : reject(new Error(`yt-dlp exited with code ${code}`))));
    });

    // Verify file exists
    if (!fs.existsSync(outputPath)) {
      throw new Error("yt-dlp reported success but file not found");
    }

    const safeTitle = path.basename(outputPath);
    // Build proxy URL that streams the file
    const downloadUrl = `${request.nextUrl.origin}/api/youtube/download?file=${encodeURIComponent(outputPath)}`;

    const videoInfo: VideoInfo = {
      filename: safeTitle,
      width: "0",
      height: "0",
      videoUrl: downloadUrl,
    };
    return NextResponse.json(makeSuccessResponse(videoInfo));
  } catch (error: any) {
    console.error("YouTube download error:", error);
    return NextResponse.json(makeErrorResponse(error.message || "Failed to download video"), { status: 500 });
  }
}
