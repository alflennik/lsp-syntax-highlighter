const fs = require("fs")
const path = require("path")
const vsctm = require("vscode-textmate")
const oniguruma = require("vscode-oniguruma")
const colors = require("./colors.json")
const database = require("./database.json")

const colorsToIndexes = Object.fromEntries(
  colors.map((color, index) => {
    return [color, index]
  }),
)

const Highlighter = async ({ languages }) => {
  // See https://www.npmjs.com/package/vscode-textmate
  const wasmBin = fs.readFileSync(
    path.join(__dirname, "./node_modules/vscode-oniguruma/release/onig.wasm"),
  ).buffer

  const vscodeOnigurumaLib = oniguruma.loadWASM(wasmBin).then(() => {
    return {
      createOnigScanner(patterns) {
        return new oniguruma.OnigScanner(patterns)
      },
      createOnigString(s) {
        return new oniguruma.OnigString(s)
      },
    }
  })

  // Create a registry that can create a grammar from a scope name.
  const registry = new vsctm.Registry({
    onigLib: vscodeOnigurumaLib,
    loadGrammar: scopeName => {
      return languages.find(language => language.scopeName === scopeName)
    },
  })

  // Load the grammar and any other grammars included by it async.
  const grammars = {}
  for (const language of languages) {
    grammars[language.name] = await registry.loadGrammar(language.scopeName)
  }

  const highlight = (code, { language: languageName, lineOffset = 0, columnOffset = 0 }) => {
    const grammar = grammars[languageName]

    const grammarTokens = []

    let context = vsctm.INITIAL
    code.split("\n").forEach((line, lineIndex) => {
      const lineTokens = grammar.tokenizeLine(line, context)

      lineTokens.tokens.forEach(({ startIndex, endIndex, scopes }) => {
        const length = endIndex - startIndex
        grammarTokens.push({ lineIndex, columnIndex: startIndex, length, scopes })
      })

      context = lineTokens.ruleStack
    })

    const tokens = grammarTokens.map(({ lineIndex, columnIndex, length, scopes }) => {
      const semanticToken = convertScopesToColor(scopes) ?? database.default

      return {
        lineIndex: lineOffset + lineIndex,
        columnIndex: columnOffset + columnIndex,
        length,
        semanticToken,
      }
    })

    let lastLineIndex = 0
    let lastColumnIndex = 0

    const encodedTokens = []

    tokens.forEach(({ lineIndex, columnIndex, length, semanticToken }) => {
      const semanticTokenIndex = colorsToIndexes[semanticToken]

      encodedTokens.push(
        lineIndex - lastLineIndex,
        columnIndex - lastColumnIndex,
        length,
        semanticTokenIndex,
        tokenModifiersEncoded,
      )

      lastLineIndex = lineIndex
      lastColumnIndex = columnIndex
    })

    return { encodedTokens, tokens }
  }

  return { highlight }
}

const databaseEntries = Object.entries(database)

const matchScope = (providedScope, databaseScope) => {
  if (!databaseScope) {
    debugger
  }
  const databaseScopeSegments = databaseScope.split(".")
  const providedScopeSegments = providedScope.split(".")
  for (let i = 0; i < databaseScopeSegments.length; i += 1) {
    if (databaseScopeSegments[i] !== providedScopeSegments[i]) return false
  }
  return true
}

const convertScopesToColor = providedScopes => {
  let isExactScope
  let scopeCount = 0
  let scopeDistances = []
  let scopeSpecificities = []
  let color

  databaseEntries.forEach(([databaseScopeString, databaseColor]) => {
    const databaseScopes = databaseScopeString.split(" ")

    const entryIsExact = matchScope(providedScopes.at(-1), databaseScopes.at(-1))

    if (isExactScope && !entryIsExact) return

    const entryScopeDistancesInsertionOrder = []
    const entryScopeSpecificitiesInsertionOrder = []

    let i = 0
    let j = 0
    let iterationCount = 0
    const maxIterationCount = 100
    while (true) {
      if (iterationCount > maxIterationCount) throw new Error("Max iterations exceeded")
      iterationCount += 1

      if (matchScope(providedScopes[j], databaseScopes[i])) {
        const providedScopesDistance = providedScopes.length - j
        const databaseScopesDistance = databaseScopes.length - i
        entryScopeDistancesInsertionOrder.push(providedScopesDistance - databaseScopesDistance)
        entryScopeSpecificitiesInsertionOrder.push(databaseScopes[i].split(".").length)
        i += 1
        j += 1
      } else {
        j += 1
      }

      if (i === databaseScopes.length && j === providedScopes.length) break

      if (i === databaseScopes.length || j === providedScopes.length) return
    }

    const entryScopeCount = databaseScopes.length
    const entryScopeDistances = entryScopeDistancesInsertionOrder.reverse()
    const entryScopeSpecificities = entryScopeSpecificitiesInsertionOrder.reverse()

    let isWinner
    if (entryScopeCount > scopeCount) {
      isWinner = true
    } else if (entryScopeCount === scopeCount) {
      let isDistanceWinner
      for (let i = 0; i < entryScopeDistances.length; i += 1) {
        if (entryScopeDistances[i] > scopeDistances[i]) {
          isDistanceWinner = true
          break
        } else if (entryScopeDistances[i] === scopeDistances[i]) {
          continue
        } else {
          isDistanceWinner = false
        }
      }
      if (isDistanceWinner !== undefined) {
        isWinner = isDistanceWinner
      } else {
        let isSpecificityWinner

        for (let i = 0; i < entryScopeSpecificities.length; i += 1) {
          if (entryScopeSpecificities[i] > scopeSpecificities[i]) {
            isSpecificityWinner = true
            break
          } else if (entryScopeSpecificities[i] === scopeSpecificities[i]) {
            continue
          } else {
            isSpecificityWinner = false
          }
        }

        if (isSpecificityWinner === true || isSpecificityWinner === undefined) {
          isWinner = true
        } else {
          isWinner = false
        }
      }
    }

    if (!isWinner) return

    isExactScope = entryIsExact
    scopeCount = entryScopeCount
    scopeDistances = entryScopeDistances
    scopeSpecificities = entryScopeSpecificities
    color = databaseColor
  })

  return color
}

const convertIntegerArrayToBitmask = indexes => {
  let bitmask = 0

  indexes.forEach(index => {
    bitmask += Math.pow(2, index)
  })

  return bitmask
}

// const convertCssHexToNumber = hex => parseInt(hex.replace("#", ""))

const tokenModifiersEncoded = convertIntegerArrayToBitmask([0])

module.exports = Highlighter
