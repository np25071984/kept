import type { Cents } from './money.js'

// Watched-group totals and how much of the relevant spending was checked for them (VISION.md §3.3, "Coverage").

export type WatchedGroup = { kind: 'category'; path: string } | { kind: 'item'; item: string }

export interface CoverageLine {
  amount: Cents
  category: string
  item?: string | null
}

export interface CoverageTransaction {
  checked_groups: string[]
  lines: CoverageLine[]
}

export interface Coverage {
  group: string
  total: Cents
  // Share of the spending the group is bought in that was checked for it, 0–1; null when there was none.
  checked_share: number | null
  // The total if unchecked spending is like checked spending; null when nothing was checked.
  estimate: Cents | null
}

export function isUnder(path: string, ancestor: string): boolean {
  const p = path.toLowerCase()
  const a = ancestor.toLowerCase()
  return p === a || p.startsWith(`${a}/`)
}

// One entry per group, whatever the case it was written in.
export function uniqueGroups(groups: WatchedGroup[]): WatchedGroup[] {
  return [...new Map(groups.map((group) => [groupKey(group).toLowerCase(), group])).values()]
}

export function groupKey(group: WatchedGroup): string {
  return group.kind === 'category' ? group.path : group.item
}

export function inGroup(line: CoverageLine, group: WatchedGroup): boolean {
  return group.kind === 'category'
    ? isUnder(line.category, group.path)
    : line.item != null && line.item.toLowerCase() === group.item.toLowerCase()
}

function topLevel(path: string): string {
  return path.split('/')[0]!.toLowerCase()
}

export function computeCoverage(group: WatchedGroup, transactions: CoverageTransaction[]): Coverage {
  const key = groupKey(group)
  // The spending a group could hide in: its parent category, or every category the item has been bought in.
  const base = new Set<string>()
  if (group.kind === 'category') base.add(topLevel(group.path))
  for (const tx of transactions) for (const line of tx.lines) if (inGroup(line, group)) base.add(topLevel(line.category))

  let total = 0
  let baseTotal = 0
  let checkedBase = 0
  for (const tx of transactions) {
    const checked = tx.checked_groups.some((g) => g.toLowerCase() === key.toLowerCase())
    for (const line of tx.lines) {
      if (inGroup(line, group)) total += line.amount
      if (base.has(topLevel(line.category))) {
        baseTotal += line.amount
        if (checked) checkedBase += line.amount
      }
    }
  }
  const share = baseTotal > 0 ? checkedBase / baseTotal : null
  return {
    group: key,
    total,
    checked_share: share == null ? null : Math.round(share * 1000) / 1000,
    estimate: share ? Math.round(total / share) : null,
  }
}

// A group with a line item in the purchase was checked by definition.
export function groupsWithLines(groups: WatchedGroup[], lines: CoverageLine[]): string[] {
  return groups.filter((group) => lines.some((line) => inGroup(line, group))).map(groupKey)
}

// The groups a purchase records as checked: those the user answered about, once each, and those its lines cover.
export function checkedGroups(answered: string[], watched: WatchedGroup[], lines: CoverageLine[]): string[] {
  return [...new Set([...answered.map((group) => group.trim()), ...groupsWithLines(watched, lines)])]
}