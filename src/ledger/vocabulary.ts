import type { Tx } from '../db/db.js'
import { similarNames } from '../domain/names.js'
import { isValidCategoryPath, parentPath } from '../domain/setup.js'
import type { Caller } from './caller.js'
import { conflict, invalid } from './errors.js'

// Categories and cost centers, the household's shared vocabulary. The API speaks category paths and cost center names.

export interface Vocabulary {
  categoryId(path: string): string
  categoryPath(id: string): string
  costCenterId(name: string): string
  costCenterName(id: string): string
}

function unknown(code: string, what: string, said: string, known: string[]) {
  const similar = similarNames(said, known)
  const hint = similar.length ? ` Ask the user whether they meant ${similar.map((name) => `"${name}"`).join(' or ')}, or want a new one.` : ' Ask the user whether it\'s new or one of the known ones.'
  return invalid(code, `There is no ${what} "${said}".${hint} Don't add it without that answer.`, { known: [...known].sort(), similar })
}

export async function loadVocabulary(tx: Tx): Promise<Vocabulary> {
  const [categories, costCenters] = await Promise.all([
    tx.selectFrom('categories').select(['id', 'path']).execute(),
    tx.selectFrom('cost_centers').select(['id', 'name']).execute(),
  ])
  const byPath = new Map(categories.map((c) => [c.path.toLowerCase(), c.id]))
  const pathById = new Map(categories.map((c) => [c.id, c.path]))
  const byName = new Map(costCenters.map((c) => [c.name.toLowerCase(), c.id]))
  const nameById = new Map(costCenters.map((c) => [c.id, c.name]))
  return {
    categoryId(path) {
      const id = byPath.get(path.trim().toLowerCase())
      // An unknown name is often a typo, so it is an error the agent takes back to the user rather than a new row (IMPLEMENTATION.md §2).
      if (!id) throw unknown('unknown_category', 'category', path, categories.map((c) => c.path))
      return id
    },
    categoryPath: (id) => pathById.get(id) ?? '',
    costCenterId(name) {
      const id = byName.get(name.trim().toLowerCase())
      if (!id) throw unknown('unknown_cost_center', 'cost center', name, costCenters.map((c) => c.name))
      return id
    },
    costCenterName: (id) => nameById.get(id) ?? '',
  }
}

export async function listCategories(tx: Tx): Promise<{ path: string }[]> {
  const rows = await tx.selectFrom('categories').select('path').orderBy('path').execute()
  return rows
}

export async function addCategory(tx: Tx, caller: Caller, path: string): Promise<{ path: string }> {
  const clean = path.trim()
  if (!isValidCategoryPath(clean)) throw invalid('invalid_category', 'A category path is up to three non-empty parts separated by "/".')
  const existing = await tx.selectFrom('categories').select('path').where((eb) => eb(eb.fn('lower', ['path']), '=', clean.toLowerCase())).executeTakeFirst()
  if (existing) throw conflict('category_exists', `"${existing.path}" already exists.`)
  const parent = parentPath(clean)
  if (parent) {
    const found = await tx.selectFrom('categories').select('id').where((eb) => eb(eb.fn('lower', ['path']), '=', parent.toLowerCase())).executeTakeFirst()
    if (!found) throw invalid('unknown_category', `Add "${parent}" before "${clean}".`)
  }
  await tx.insertInto('categories').values({ household_id: caller.household_id, path: clean }).execute()
  return { path: clean }
}

export interface CostCenterView {
  name: string
  kind: string
  categories: string[]
}

export async function listCostCenters(tx: Tx, category?: string): Promise<CostCenterView[]> {
  const vocabulary = await loadVocabulary(tx)
  const centers = await tx.selectFrom('cost_centers').select(['id', 'name', 'kind']).orderBy('name').execute()
  const links = await tx.selectFrom('cost_center_categories').select(['cost_center_id', 'category_id']).execute()
  const views = centers.map((center) => ({
    name: center.name,
    kind: center.kind,
    categories: links.filter((l) => l.cost_center_id === center.id).map((l) => vocabulary.categoryPath(l.category_id)).sort(),
  }))
  if (!category) return views
  // A cost center linked to "Car" is offered for "Car/Fuel".
  const wanted = category.toLowerCase()
  return views.filter((view) => view.categories.some((path) => wanted === path.toLowerCase() || wanted.startsWith(`${path.toLowerCase()}/`)))
}

export async function addCostCenter(tx: Tx, caller: Caller, input: { name: string; kind: string; categories?: string[] }): Promise<CostCenterView> {
  const name = input.name.trim()
  if (!name) throw invalid('invalid_cost_center', 'A cost center needs a name.')
  const vocabulary = await loadVocabulary(tx)
  const categoryIds = (input.categories ?? []).map((path) => vocabulary.categoryId(path))
  const existing = await tx.selectFrom('cost_centers').select('name').where((eb) => eb(eb.fn('lower', ['name']), '=', name.toLowerCase())).executeTakeFirst()
  if (existing) throw conflict('cost_center_exists', `"${existing.name}" already exists.`)
  const { id } = await tx.insertInto('cost_centers').values({ household_id: caller.household_id, name, kind: input.kind.trim() }).returning('id').executeTakeFirstOrThrow()
  if (categoryIds.length > 0) {
    await tx.insertInto('cost_center_categories').values([...new Set(categoryIds)].map((category_id) => ({ household_id: caller.household_id, cost_center_id: id, category_id }))).execute()
  }
  return { name, kind: input.kind.trim(), categories: (input.categories ?? []).map((path) => vocabulary.categoryPath(vocabulary.categoryId(path))).sort() }
}