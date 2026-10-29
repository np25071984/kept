// Existing names close to one the user said that isn't in the household: likely typos ("Iva" for "Ivy") or a shorter
// form ("Kia" for "Kia Carnival"), or another form of the word ("Grocery" for "Groceries"). Categories compare by path and by their last part.

// Edits between two names, counting two swapped letters ("Kai" for "Kia") as one.
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const row = d[i]!
      row[j] = Math.min(d[i - 1]![j]! + 1, row[j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j]!, d[i - 2]![j - 2]! + 1)
    }
  }
  return d[a.length]![b.length]!
}

function sharedStart(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

function close(said: string, name: string): boolean {
  const words = name.split(/\s+/)
  if (words.length > 1 && words.includes(said)) return true
  if (sharedStart(said, name) >= 5) return true
  return distance(said, name) <= (Math.min(said.length, name.length) <= 4 ? 1 : 2)
}

export function similarNames(said: string, known: string[]): string[] {
  const wanted = said.trim().toLowerCase()
  if (!wanted) return []
  return known.filter((name) => {
    const lower = name.toLowerCase()
    return close(wanted, lower) || close(wanted, lower.split('/').pop()!)
  })
}
