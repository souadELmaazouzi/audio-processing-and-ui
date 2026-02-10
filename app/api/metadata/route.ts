import { NextResponse } from "next/server"
import * as fs from "fs"
import * as path from "path"
import * as csv from "csv-parse/sync"

/**
 * GET /api/metadata
 * Returns list of utterance IDs from metadata.csv in loudspeaker_asr_dataset
 */
export async function GET() {
  try {
    const dataRoot = process.env.DATA_ROOT || path.join(process.cwd(), "loudspeaker_asr_dataset")
    const metadataPath = path.join(dataRoot, "metadata.csv")

    if (!fs.existsSync(metadataPath)) {
      return NextResponse.json({ error: "Metadata file not found", path: metadataPath, dataRoot }, { status: 404 })
    }

    const content = fs.readFileSync(metadataPath, "utf-8")
    const records = csv.parse(content, {
      columns: true,
      skip_empty_lines: true,
    })

    const uttIds = [...new Set(records.map((r: any) => r.utt_id))].sort()

    const metadata = records.map((r: any) => ({
      utt_id: r.utt_id,
      condition: r.condition,
      distance_m: Number.parseFloat(r.distance_m) || 0,
      text: r.text,
      relpath: r.relpath,
    }))

    return NextResponse.json({
      uttIds,
      totalCount: uttIds.length,
      metadata,
    })
  } catch (error) {
    console.error("[API] Metadata error:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 })
  }
}
