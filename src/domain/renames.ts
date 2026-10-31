import type { RepeatTemplate } from './repeats.js'
import { isValidCategoryPath, parentPath } from './setup.js'

// Renaming and deleting the household's vocabulary. Most references link by id, but repeat templates and checked groups
// hold paths and names as text, so a rename rewrites them too.

export interface Renamer {
  category(path: string): string
  costCenter(name: string): string
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

// Renames a category and everything under it: "Car" to "Auto" turns "Car/Fuel" into "Auto/Fuel".
export function renamePath(path: string, from: string, to: string): string {
  if (same(path, from)) return to
  if (path.toLowerCase().startsWith(`${from.toLowerCase()}/`)) return `${to}${path.slice(from.length)}`
  return path
}

export function categoryRenamer(from: string, to: string): Renamer {
  return { category: (path) => renamePath(path, from, to), costCenter: (name) => name }
}

export function costCenterRenamer(from: string, to: string): Renamer {
  return { category: (path) => path, costCenter: (name) => (same(name, from) ? to : name) }
}

export type Problem = { code: string; message: string }

// Why `from` can't become `to`, given every existing path, or null.
export function checkCategoryRename(from: string, to: string, paths: string[]): Problem | null {
  if (!isValidCategoryPath(to)) return { code: 'invalid_category', message: 'A category path is up to three non-empty parts separated by "/".' }
  if (!paths.some((path) => same(path, from))) return { code: 'unknown_category', message: `There is no category "${from}".` }
  if (to.toLowerCase().startsWith(`${from.toLowerCase()}/`)) return { code: 'invalid_category', message: `"${from}" can't move under itself.` }
  const taken = paths.find((path) => same(path, to))
  if (taken && !same(taken, from)) return { code: 'category_exists', message: `"${taken}" already exists.` }
  const parent = parentPath(to)
  if (parent && !paths.some((path) => same(path, parent))) return { code: 'unknown_category', message: `Add "${parent}" before moving a category under it.` }
  const tooDeep = paths.map((path) => renamePath(path, from, to)).find((path) => path.split('/').length > 3)
  if (tooDeep) return { code: 'invalid_category', message: `That would make "${tooDeep}", deeper than three levels.` }
  return null
}

export function checkCostCenterRename(from: string, to: string, names: string[]): Problem | null {
  if (!to.trim()) return { code: 'invalid_cost_center', message: 'A person or thing needs a name.' }
  if (!names.some((name) => same(name, from))) return { code: 'unknown_cost_center', message: `There is no person or thing called "${from}".` }
  const taken = names.find((name) => same(name, to))
  if (taken && !same(taken, from)) return { code: 'cost_center_exists', message: `"${taken}" already exists.` }
  return null
}

export function renameTemplate(template: RepeatTemplate, renamer: Renamer): RepeatTemplate {
  return {
    ...template,
    category: template.category && renamer.category(template.category),
    line_items: template.line_items.map((line) => ({
      ...line,
      category: renamer.category(line.category),
      ...(line.spent_for && { spent_for: line.spent_for.map((entry) => ({ ...entry, cost_center: renamer.costCenter(entry.cost_center) })) }),
    })),
  }
}

// Whether a repeat template mentions this category (or one under it) or this cost center.
export function mentions(renamer: Renamer, template: RepeatTemplate): boolean {
  return JSON.stringify(template) !== JSON.stringify(renameTemplate(template, renamer))
}

export type Usage = Partial<Record<'purchases' | 'subcategories' | 'watched groups' | 'repeats' | 'caps', number>>

// Why a category or cost center can't be deleted yet, or null when nothing uses it. `what` prefixes the name, e.g. "Category ".
export function usageProblem(what: string, name: string, usage: Usage): Problem | null {
  // Kinds only, no counts: the counts include other members' purchases, private ones too.
  const parts = Object.entries(usage).filter(([, count]) => (count ?? 0) > 0).map(([kind]) => kind)
  if (parts.length === 0) return null
  return { code: 'in_use', message: `${what}"${name}" is still used by ${parts.join(', ')}. Move or change those first, or rename it instead.` }
}
