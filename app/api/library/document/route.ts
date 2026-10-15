/**
 * Fetch one document's extracted text from the encrypted document store, on demand.
 * The library list renders from the content-free manifest; text is only loaded when
 * a reviewer opens (and possibly edits) a specific document.
 */
import { NextRequest, NextResponse } from "next/server";
import { isDocStoreConfigured } from "@/lib/docstore";
import { loadDocumentText } from "@/lib/library-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const engagementId = searchParams.get("engagementId") || "";
  const docId = searchParams.get("docId") || "";
  if (!engagementId || !docId) {
    return NextResponse.json({ error: "engagementId and docId are required" }, { status: 400 });
  }
  if (!isDocStoreConfigured()) {
    return NextResponse.json({ error: "Document store is not configured." }, { status: 503 });
  }

  try {
    const text = await loadDocumentText(engagementId, docId);
    if (text === null) return NextResponse.json({ error: "Document text not found" }, { status: 404 });
    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read the document.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
