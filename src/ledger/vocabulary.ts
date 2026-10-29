import { sql } from 'kysely'
import type { Tx } from '../db/db.js'
import { similarNames } from '../domain/names.js'
import {
  categoryRenamer, checkCategoryRename, checkCostCenterRename, costCenterRenamer, mentions, renamePath, renameTemplate, usageProblem,
  type Problem, type Renamer,
} from '../domain/renames.js'
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
      if (!id) throw unknown('unknown_cost_center', 'person or thing called', name, costCenters.map((c) => c.name))
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
  if (!name) throw invalid('invalid_cost_center', 'A person or thing needs a name.')
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
// Renames and deletes (IMPLEMENTATION.md §2). A rename keeps every link; a delete only goes through when nothing uses the name.

function fail(problem: Problem): never {
  throw problem.code.endsWith('_exists') || problem.code === 'in_use' ? conflict(problem.code, problem.message) : invalid(problem.code, problem.message)
}

async function rewriteText(tx: Tx, renamer: Renamer, checkedGroups: boolean): Promise<void> {
  for (const repeat of await tx.selectFrom('repeats').select(['id', 'template']).execute()) {
    const template = renameTemplate(repeat.template, renamer)
    if (JSON.stringify(template) !== JSON.stringify(repeat.template)) await tx.updateTable('repeats').set({ template: JSON.stringify(template) }).where('id', '=', repeat.id).execute()
  }
  if (!checkedGroups) return
  const checked = await tx.selectFrom('transactions').select(['id', 'checked_groups']).where(sql<number>`cardinality(checked_groups)`, '>', 0).execute()
  for (const row of checked) {
    const groups = row.checked_groups.map((group) => renamer.category(group))
    if (groups.some((group, i) => group !== row.checked_groups[i])) await tx.updateTable('transactions').set({ checked_groups: groups }).where('id', '=', row.id).execute()
  }
}

// Repeats whose template mentions the name, for the delete check.
async function repeatsMentioning(tx: Tx, renamer: Renamer): Promise<number> {
  return (await tx.selectFrom('repeats').select('template').execute()).filter((repeat) => mentions(renamer, repeat.template)).length
}

export async function renameCategory(tx: Tx, path: string, newPath: string): Promise<{ path: string }> {
  const from = path.trim()
  const to = newPath.trim()
  const categories = await tx.selectFrom('categories').select(['id', 'path']).execute()
  const problem = checkCategoryRename(from, to, categories.map((c) => c.path))
  if (problem) fail(problem)
  const stored = categories.find((c) => c.path.toLowerCase() === from.toLowerCase())!.path
  for (const category of categories) {
    const renamed = renamePath(category.path, stored, to)
    if (renamed !== category.path) await tx.updateTable('categories').set({ path: renamed }).where('id', '=', category.id).execute()
  }
  await rewriteText(tx, categoryRenamer(stored, to), true)
  return { path: to }
}

export async function deleteCategory(tx: Tx, path: string): Promise<void> {
  const categories = await tx.selectFrom('categories').select(['id', 'path']).execute()
  const category = categories.find((c) => c.path.toLowerCase() === path.trim().toLowerCase())
  if (!category) throw invalid('unknown_category', `There is no category "${path}".`)
  const purchases = await tx
    .selectFrom('transactions')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .where((eb) => eb.or([eb('main_category_id', '=', category.id), eb.exists(eb.selectFrom('line_items').select('id').whereRef('line_items.transaction_id', '=', 'transactions.id').where('line_items.category_id', '=', category.id))]))
    .executeTakeFirstOrThrow()
  // Any member's watched groups count, without saying whose.
  const watches = await tx.selectFrom('watches').select((eb) => eb.fn.countAll<string>().as('count')).where('category_id', '=', category.id).executeTakeFirstOrThrow()
  const problem = usageProblem('Category ', category.path, {
    purchases: Number(purchases.count),
    subcategories: categories.filter((c) => c.path.toLowerCase().startsWith(`${category.path.toLowerCase()}/`)).length,
    'watched groups': Number(watches.count),
    repeats: await repeatsMentioning(tx, categoryRenamer(category.path, '\0')),
  })
  if (problem) fail(problem)
  await tx.deleteFrom('categories').where('id', '=', category.id).execute()
}

export interface CostCenterPatch {
  new_name?: string
  kind?: string
  categories?: string[]
}

// Renames a cost center, changes its kind, or replaces the categories it is linked to.
export async function updateCostCenter(tx: Tx, caller: Caller, name: string, patch: CostCenterPatch): Promise<CostCenterView> {
  const from = name.trim()
  const centers = await tx.selectFrom('cost_centers').select(['id', 'name']).execute()
  const center = centers.find((c) => c.name.toLowerCase() === from.toLowerCase())
  if (!center) throw invalid('unknown_cost_center', `There is no person or thing called "${from}".`)
  let current = center.name
  if (patch.new_name !== undefined) {
    const to = patch.new_name.trim()
    const problem = checkCostCenterRename(from, to, centers.map((c) => c.name))
    if (problem) fail(problem)
    await tx.updateTable('cost_centers').set({ name: to }).where('id', '=', center.id).execute()
    await rewriteText(tx, costCenterRenamer(center.name, to), false)
    current = to
  }
  if (patch.kind !== undefined) {
    if (!patch.kind.trim()) throw invalid('invalid_cost_center', 'A person or thing needs a kind, such as Car or Child.')
    await tx.updateTable('cost_centers').set({ kind: patch.kind.trim() }).where('id', '=', center.id).execute()
  }
  if (patch.categories !== undefined) {
    const vocabulary = await loadVocabulary(tx)
    const ids = [...new Set(patch.categories.map((path) => vocabulary.categoryId(path)))]
    await tx.deleteFrom('cost_center_categories').where('cost_center_id', '=', center.id).execute()
    if (ids.length) await tx.insertInto('cost_center_categories').values(ids.map((category_id) => ({ household_id: caller.household_id, cost_center_id: center.id, category_id }))).execute()
  }
  return (await listCostCenters(tx)).find((c) => c.name === current)!
}

export async function deleteCostCenter(tx: Tx, name: string): Promise<void> {
  const center = await tx.selectFrom('cost_centers').select(['id', 'name']).where((eb) => eb(eb.fn('lower', ['name']), '=', name.trim().toLowerCase())).executeTakeFirst()
  if (!center) throw invalid('unknown_cost_center', `There is no person or thing called "${name}".`)
  const purchases = await tx
    .selectFrom('line_item_cost_centers')
    .innerJoin('line_items', 'line_items.id', 'line_item_cost_centers.line_item_id')
    .select((eb) => eb.fn.count<string>('line_items.transaction_id').distinct().as('count'))
    .where('line_item_cost_centers.cost_center_id', '=', center.id)
    .executeTakeFirstOrThrow()
  const problem = usageProblem('', center.name, { purchases: Number(purchases.count), repeats: await repeatsMentioning(tx, costCenterRenamer(center.name, '\0')) })
  if (problem) fail(problem)
  await tx.deleteFrom('cost_centers').where('id', '=', center.id).execute()
}
