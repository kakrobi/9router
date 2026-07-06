import { NextResponse } from "next/server";
import { autoDetectFilter } from "../../../../../open-sse/rtk/autodetect.js";
import { safeApply } from "../../../../../open-sse/rtk/applyFilter.js";

export async function POST(request) {
  try {
    const { text, mode } = await request.json();
    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }
    
    if (mode === "rtk") {
      const fn = autoDetectFilter(text);
      if (!fn) {
        return NextResponse.json({
          originalSize: text.length,
          compressedSize: text.length,
          savedBytes: 0,
          ratio: 0,
          text: text,
          filterName: "none (no matching pattern found)"
        });
      }
      const compressed = safeApply(fn, text);
      const originalSize = text.length;
      const compressedSize = compressed.length;
      const savedBytes = originalSize - compressedSize;
      const ratio = originalSize > 0 ? savedBytes / originalSize : 0;
      return NextResponse.json({
        originalSize,
        compressedSize,
        savedBytes,
        ratio,
        text: compressed,
        filterName: fn.filterName || fn.name
      });
    } else if (mode === "caveman") {
      // Simulate caveman
      const originalSize = text.length;
      // A fun and accurate client-side terse filter that replaces fluff words
      const compressed = text
        .replace(/\b(a|an|the|is|are|was|were|please|sorry|thank\s+you)\b/gi, "")
        .replace(/\b(i am|we are|you are|they are)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      const compressedSize = compressed.length;
      const savedBytes = originalSize - compressedSize;
      const ratio = originalSize > 0 ? savedBytes / originalSize : 0;
      return NextResponse.json({
        originalSize,
        compressedSize,
        savedBytes,
        ratio,
        text: compressed || text,
        filterName: "caveman-terse-prompt"
      });
    } else {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
