let databaseScopesByRank
let maximumRank

const Converter = scopesByRank => {
  databaseScopesByRank = scopesByRank

  maximumRank = Number(Object.keys(databaseScopesByRank).pop())

  return convertGrammarScopeToDatabaseScope
}

const convertGrammarScopeToDatabaseScope = (
  grammarScopeStack,
  { diagnosticReturnAllMatches = false } = {},
) => {
  let i = 0
  let rank = maximumRank
  let iterationCount = 0
  const maxIterationCount = 100_000_000
  while (true) {
    iterationCount += 1
    if (iterationCount > maxIterationCount) throw new Error("Max iteration count exceeded")

    const currentRankContainsItems = !!databaseScopesByRank[rank]
    if (!currentRankContainsItems) {
      if (rank === 0) break
      rank -= 1
      continue
    }

    const databaseScopeStack = databaseScopesByRank[rank][i]
    // if (databaseScopeStack === "source.css") {
    //   debugger
    // }
    const isMatch = matchScopeStacks(grammarScopeStack, databaseScopeStack.split(" "))
    if (isMatch) {
      if (!diagnosticReturnAllMatches) {
        return databaseScopeStack
      } else {
        console.log(databaseScopeStack, rank)
      }
    }

    i += 1
    if (i === databaseScopesByRank[rank].length) {
      if (rank === 0) break // Failed to find even a single match
      rank -= 1
      i = 0
      continue // No matches in this rank, try the next one down
    }
  }
  return undefined
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

module.exports = Converter
