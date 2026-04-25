const initializeGetDatabaseScope = grammarScopesByRank => {
  const cache = new Cache(50_000)

  const getDatabaseScope = (grammarScopeStack, { diagnosticReturnAllMatches = false } = {}) => {
    const grammarScopeName = grammarScopeStack[0]

    const scopesByRank = grammarScopesByRank[grammarScopeName]
    if (!scopesByRank) return "default"
    const maximumRank = Number(Object.keys(scopesByRank).pop())

    let i = 0
    let rank = maximumRank
    let iterationCount = 0
    const maxIterationCount = 100_000_000
    while (true) {
      iterationCount += 1
      if (iterationCount > maxIterationCount) throw new Error("Max iteration count exceeded")

      const currentRankContainsItems = !!scopesByRank[rank]
      if (!currentRankContainsItems) {
        if (rank === 0) break
        rank -= 1
        continue
      }

      const databaseScopeStack = scopesByRank[rank][i]
      const isMatch = matchScopeStacks(grammarScopeStack, databaseScopeStack.split(" "))
      if (isMatch) {
        if (!diagnosticReturnAllMatches) {
          return databaseScopeStack
        } else {
          console.log(databaseScopeStack, rank)
        }
      }

      i += 1
      if (i === scopesByRank[rank].length) {
        if (rank === 0) break // Failed to find even a single match
        rank -= 1
        i = 0
        continue // No matches in this rank, try the next one down
      }
    }
    return "default"
  }

  const getDatabaseScopeCached = (...args) => {
    const grammarScopeStack = args[0]
    const key = grammarScopeStack.join(" ")

    const cachedResult = cache.get(key)
    if (cachedResult) return cachedResult

    const result = getDatabaseScope(...args)
    cache.set(key, result)
    return result
  }

  return { getDatabaseScope: getDatabaseScopeCached }
}

const matchScopeStacks = (grammarScopeStack, databaseScopeStack) => {
  let i = 0
  let j = 0
  let iterationCount = 0
  const maxIterationCount = 100
  while (true) {
    if (iterationCount > maxIterationCount) throw new Error("Max iterations exceeded")
    iterationCount += 1

    if (matchSingleScope(grammarScopeStack[j], databaseScopeStack[i])) {
      i += 1
      j += 1
    } else {
      j += 1
    }

    if (i === databaseScopeStack.length) return true

    if (i === databaseScopeStack.length || j === grammarScopeStack.length) return false
  }
}

const matchSingleScope = (grammarScope, databaseScope) => {
  const databaseScopeSegments = databaseScope.split(".")
  const grammarScopeSegments = grammarScope.split(".")
  for (let i = 0; i < databaseScopeSegments.length; i += 1) {
    if (databaseScopeSegments[i] !== grammarScopeSegments[i]) return false
  }
  return true
}

// https://stackoverflow.com/questions/996505/lru-cache-implementation-in-javascript
class Cache {
  constructor(max) {
    this.max = max
    this.cache = new Map()
  }

  get(key) {
    let item = this.cache.get(key)
    if (item !== undefined) {
      // refresh key
      this.cache.delete(key)
      this.cache.set(key, item)
    }
    return item
  }

  set(key, val) {
    // refresh key
    if (this.cache.has(key)) this.cache.delete(key)
    // evict oldest
    else if (this.cache.size === this.max) this.cache.delete(this.first())
    this.cache.set(key, val)
  }

  first() {
    return this.cache.keys().next().value
  }
}

module.exports = initializeGetDatabaseScope
