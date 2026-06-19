"use client";
/** Client-side file download helper. The app has no other download path (PDF uses
 * window.print), so this is the shared way to hand a generated text artifact to the
 * browser's download flow. */

export function downloadTextFile(filename: string, content: string, mime = "application/xml"): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
