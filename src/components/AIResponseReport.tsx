"use client";

import { useState, type ReactNode } from "react";

type ObjectValue = Record<string, unknown>;
function object(value: unknown): value is ObjectValue { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
const metadata = new Set(["id", "model", "usage", "createdAt", "created_at", "updatedAt", "updated_at", "request_id", "receipt", "provider", "success"]);
const label = (value: string) => value.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, letter => letter.toUpperCase());
function unavailable(value: unknown): string | null {
  let current = value;
  for (let index = 0; index < 8; index++) {
    if (typeof current === "string") {
      if (/^\s*\[mock\]/i.test(current)) return "This saved sample is not an OpenRouter response. Generate a new report using a configured provider.";
      try { current = JSON.parse(current.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); continue; } catch { return null; }
    }
    if (!object(current)) return null;
    if (current.mocked === true || current.mock === true || current.fallback === true) return "This saved sample is not an OpenRouter response. Generate a new report using a configured provider.";
    if (current.success === false || (current.error && !current.summary && !current.findings && !current.recommendations)) return "The AI request did not complete. Check the service error and retry; no report is available.";
    const record = current;
    const key = ["result_json", "structured", "parsed", "result", "output", "analysis", "ai_response", "response", "content", "raw"].find(name => record[name] !== undefined && record[name] !== null);
    if (!key) return null;
    current = record[key];
  }
  return null;
}
export function reportValue(value: unknown): unknown {
  let current = value;
  for (let index = 0; index < 8; index++) {
    if (typeof current === "string") {
      const trimmed = current.trim(), fence = trimmed.match(/^```(?:json|markdown|md|text|txt)?\s*([\s\S]*?)\s*```$/i);
      const text = fence ? fence[1].trim() : trimmed;
      if (/^[\[{]/.test(text)) { try { current = JSON.parse(text); continue; } catch {} }
      return text;
    }
    if (object(current)) {
      if (current.summary || current.findings || current.recommendations) return current;
      const record = current;
      const key = ["result_json", "structured", "parsed", "result", "output", "analysis", "ai_response", "response", "content", "raw"].find(name => record[name] !== undefined && record[name] !== null);
      if (key) { current = record[key]; continue; }
    }
    return current;
  }
  return current;
}
function fencedReportParts(text: string): unknown[] | null {
  const pattern = /(^|\r?\n)[ \t]*```(?:json|markdown|md|text|txt)?[^\S\r\n]*\r?\n([\s\S]*?)\r?\n[ \t]*```(?=[ \t]*(?:\r?\n|$))/gi, parts: unknown[] = [];
  let position = 0, match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > position) parts.push(text.slice(position, match.index));
    const body = match[2].trim();
    if (/^[\[{]/.test(body)) {
      try { parts.push(JSON.parse(body)); }
      catch { parts.push("The provider returned an incomplete structured section. Review the draft or generate a new report."); }
    } else parts.push(body);
    position = pattern.lastIndex;
  }
  if (!position) return null;
  if (position < text.length) parts.push(text.slice(position));
  return parts;
}
function plain(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") { const parsed = reportValue(value); if (parsed !== value) return plain(parsed); const parts = fencedReportParts(value); if (parts) return parts.map(plain).filter(Boolean).join("\n\n"); }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(plain).filter(Boolean).join(" · ");
  if (object(value)) return Object.entries(value).filter(([key]) => !metadata.has(key)).map(([key, item]) => `${label(key)}: ${plain(item)}`).join("; ");
  return String(value);
}
export function reportText(value: unknown): string { return plain(reportValue(value)); }
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : part.startsWith("`") && part.endsWith("`") ? <code key={index} className="rounded bg-slate-100 px-1 text-sm">{part.slice(1, -1)}</code> : part);
}
function markdown(text: string) {
  const parts = fencedReportParts(text);
  if (parts) return parts.map((part, index) => <div key={index}>{typeof part === "string" ? markdown(part) : content(part)}</div>);
  const lines = text.split(/\r?\n/), blocks: ReactNode[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line || /^```/.test(line)) { index++; continue; }
    if (line.includes("|") && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) {
      const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(item => item.trim());
      const columns = cells(line), rows: string[][] = []; index += 2;
      while (index < lines.length && lines[index].trim().includes("|")) rows.push(cells(lines[index++]));
      blocks.push(<div key={blocks.length} className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full border-collapse text-left text-sm"><thead className="bg-slate-50"><tr>{columns.map((cell, column) => <th key={column} className="p-3 font-semibold">{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className="border-t border-slate-200">{columns.map((_, column) => <td key={column} className="p-3 align-top">{inline(row[column] || "")}</td>)}</tr>)}</tbody></table></div>); continue;
    }
    if (/^#{1,6}\s/.test(line)) { blocks.push(<h4 key={blocks.length} className="pt-2 text-base font-semibold text-slate-900">{inline(line.replace(/^#{1,6}\s+/, ""))}</h4>); index++; continue; }
    if (/^(?:[-*+]\s+|\d+[.)]\s+)/.test(line)) {
      const ordered = /^\d/.test(line), items: string[] = [];
      while (index < lines.length && /^(?:[-*+]\s+|\d+[.)]\s+)/.test(lines[index].trim())) items.push(lines[index++].trim().replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, ""));
      const children = items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>);
      blocks.push(ordered ? <ol key={blocks.length} className="list-decimal space-y-2 pl-5">{children}</ol> : <ul key={blocks.length} className="list-disc space-y-2 pl-5">{children}</ul>); continue;
    }
    blocks.push(<p key={blocks.length} className="whitespace-pre-wrap leading-7">{inline(lines[index++])}</p>);
  }
  return blocks;
}
function content(value: unknown, depth = 0): ReactNode {
  if (value == null || value === "") return <p className="text-slate-500">No additional details were returned.</p>;
  if (typeof value === "string") { const parsed = reportValue(value); return parsed === value ? <div className="space-y-3">{markdown(value)}</div> : content(parsed, depth + 1); }
  if (Array.isArray(value)) {
    if (value.length && value.every(object)) {
      const columns = Array.from(new Set(value.flatMap(item => Object.keys(item).filter(key => !metadata.has(key)))));
      if (columns.length && columns.length <= 8) return <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full border-collapse text-left text-sm"><thead className="bg-slate-50"><tr>{columns.map(key => <th key={key} className="p-3 font-semibold">{label(key)}</th>)}</tr></thead><tbody>{value.map((row, index) => <tr key={index} className="border-t border-slate-200">{columns.map(key => <td key={key} className="max-w-lg whitespace-pre-wrap break-words p-3 align-top">{plain(row[key]) || "—"}</td>)}</tr>)}</tbody></table></div>;
    }
    return <ul className="list-disc space-y-2 pl-5">{value.map((item, index) => <li key={index}>{object(item) && depth < 5 ? content(item, depth + 1) : inline(plain(item))}</li>)}</ul>;
  }
  if (object(value) && depth < 5) return <div className="space-y-5">{Object.entries(value).filter(([key]) => !metadata.has(key)).map(([key, item]) => <section key={key} className="space-y-2"><h4 className="font-semibold text-slate-900">{label(key)}</h4>{content(item, depth + 1)}</section>)}</div>;
  return <p className="whitespace-pre-wrap">{plain(value)}</p>;
}
export default function AIResponseReport({ value, title = "AI report", kind = "ai" }: { value: unknown; title?: string; kind?: "ai" | "workflow" }) {
  const [notice, setNotice] = useState("");
  const failure = unavailable(value);
  const report = reportValue(value), text = plain(report), model = object(value) && typeof value.model === "string" ? value.model : object(report) && typeof report.model === "string" ? report.model : null;
  async function copy() { try { await navigator.clipboard.writeText(text); setNotice("Report copied."); } catch { setNotice("Copy is unavailable. Download the report to save the text."); } }
  function download() { const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "ai-report.txt"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  if (failure) return <div role="alert" className="my-4 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900"><h3 className="font-semibold">AI report unavailable</h3><p>{failure}</p></div>;
  return <article aria-label={title} className="my-4 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm"><header className="border-b border-slate-200 bg-slate-50 p-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{kind === "ai" ? "AI response" : "Workflow response"}</p><h3 className="mt-1 text-xl font-semibold text-slate-900">{title}</h3></header><div className="space-y-5 p-5 text-sm leading-6">{content(report)}</div><footer className="space-y-2 border-t border-slate-200 p-4"><div className="flex flex-wrap gap-2"><button type="button" onClick={copy} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium">Copy report</button><button type="button" onClick={download} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium">Download report</button></div>{notice ? <p role="status" className="text-sm">{notice}</p> : null}{model ? <p className="break-all text-xs text-slate-500">Model: {model}</p> : null}</footer></article>;
}
