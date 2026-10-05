#!/usr/bin/env bun
/**
 * Life Morning Brief — Phase 0 Pulse Life Dashboard
 *
 * Reads TELOS/GOALS.md (top-3 goals), TELOS/SPARKS.md (random spark),
 * and TELOS/CURRENT.md (next likely actions). Outputs a voice-ready
 * morning brief narration.
 *
 * Output: voice narration or NO_ACTION if files missing
 */

import { join } from "path"
import { existsSync, readFileSync } from "fs"
import { homedir } from "node:os";
import { resolveStorageConfig } from "../../STORAGE/StorageConfig.ts";
import { createLifeOSStore } from "../../STORAGE/StoreFactory.ts";
import type { LifeOSStore } from "../../STORAGE/types.ts";

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? homedir()
const TELOS_DIR = join(HOME, ".claude", "LIFEOS", "USER", "TELOS")

function readFile(name: string): string {
  const p = join(TELOS_DIR, name)
  if (!existsSync(p)) return ""
  return readFileSync(p, "utf-8")
}

// GOALS.md is a legacy per-topic file, superseded by the unified TELOS.md
// (H2 sections) on 2026-05-01. Fall back to TELOS.md's "## GOALS" section
// when the legacy file has been archived, so goals written only to TELOS.md
// still surface here.
function readGoals(): string {
  const legacy = readFile("GOALS.md")
  if (legacy) return legacy
  const telos = readFile("TELOS.md")
  if (!telos) return ""
  const match = telos.match(/(?:^|\n)##\s*GOALS\b[^\n]*\n([\s\S]*?)(?=\n##\s|\n---|$)/i)
  return match ? match[1].trim() : ""
}

// Extract top 3 goals from GOALS.md
function getTopGoals(content: string): string[] {
  const lines = content.split("\n")
  const goals: string[] = []
  for (const line of lines) {
    const match = line.match(/^[-*]\s*\*{0,2}G\d+\*{0,2}:\s*(.+)/)
    if (match && goals.length < 3) {
      goals.push(match[1].replace(/\.\.\.$/, "").trim())
    }
  }
  return goals
}

// Pick a random spark name from SPARKS.md
function getRandomSpark(content: string): string | null {
  const sparks = content
    .split("\n")
    .filter(l => l.startsWith("### "))
    .map(l => l.replace(/^###\s*/, ""))
  if (sparks.length === 0) return null
  return sparks[Math.floor(Math.random() * sparks.length)]
}

// Get top next action from CURRENT.md
function getNextMove(content: string): string | null {
  const section = content.split("## Next likely actions")[1]
  if (!section) return null
  const first = section
    .split("\n")
    .find(l => /^\d+\./.test(l.trim()))
  if (!first) return null
  return first.trim().replace(/^\d+\.\s*/, "")
}

// PROVIDER_NEUTRAL_BEGIN
export async function buildProviderMorningBrief(store: LifeOSStore): Promise<string> {
  const [telos, goals, current, projects, knowledge, ideas] = await Promise.all([
    store.getDocument("principal_telos"), store.queryCollection("goals", { limit: 3, hydrateContent: true }), store.queryCollection("current_state", { limit: 5, hydrateContent: true }), store.queryCollection("projects", { limit: 3, hydrateContent: true }), store.queryCollection("knowledge", { limit: 3, hydrateContent: true }), store.queryCollection("ideas", { limit: 3, hydrateContent: true }),
  ])
  if (!telos && !goals.length && !current.length && !projects.length && !knowledge.length && !ideas.length) return "NO_ACTION"
  const label = (record: { title?: string; content?: string }) => record.title ?? record.content?.split("\n").find((line) => line.trim())?.replace(/^[-*#\s]+/, "").trim() ?? ""
  const parts = ["Good morning."]
  const goalNames = goals.map(label).filter(Boolean).slice(0, 3); if (goalNames.length) parts.push(`Your top goals: ${goalNames.map((goal, index) => `${index + 1}, ${goal}`).join(". ")}.`)
  const next = current.map((record) => getNextMove(record.content ?? "") ?? label(record)).find(Boolean); if (next) parts.push(`Next obvious move: ${next}.`)
  const project = projects.map(label).find(Boolean); if (project) parts.push(`Active project to align: ${project}.`)
  const signal = [...ideas, ...knowledge].map(label).find(Boolean); if (signal) parts.push(`One relevant signal to consider: ${signal}.`)
  if (telos?.content && !goalNames.length) parts.push("Review your current priorities against TELOS.")
  return parts.join(" ")
}
// PROVIDER_NEUTRAL_END

export function buildFilesystemMorningBrief(): string {
  const goals = readGoals()
  const sparks = readFile("SPARKS.md")
  const current = readFile("CURRENT.md")

  if (!goals && !sparks && !current) return "NO_ACTION"

const topGoals = getTopGoals(goals)
const spark = getRandomSpark(sparks)
const nextMove = getNextMove(current)

const parts: string[] = ["Good morning."]

if (topGoals.length > 0) {
  parts.push(`Your top goals: ${topGoals.map((g, i) => `${i + 1}, ${g}`).join(". ")}.`)
}

if (spark) {
  parts.push(`One spark to ask you about today: ${spark}.`)
}

if (nextMove) {
  parts.push(`Next obvious move: ${nextMove}.`)
}

  return parts.join(" ")
}

if (import.meta.main) {
  const storage = resolveStorageConfig(); const output = storage.provider === "filesystem" ? buildFilesystemMorningBrief() : await buildProviderMorningBrief(createLifeOSStore(storage)); console.log(output)
}
