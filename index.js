const fs = require("fs")
const path = require("path")
const vsctm = require("vscode-textmate")
const oniguruma = require("vscode-oniguruma")
const colors = require("./colors.json")
const database = require("./database.json")
const Converter = require("./library/convertGrammarScopeToDatabaseScope")

const colorsToIndexes = Object.fromEntries(
  colors.map((color, index) => {
    return [color, index]
  }),
)

const scopesByRank = {}
Object.entries(database.primary).forEach(([scope, { rank }]) => {
  if (!scopesByRank[rank]) scopesByRank[rank] = []
  scopesByRank[rank].push(scope)
})

const Highlighter = async ({ languages }) => {
  const convertGrammarScopeToDatabaseScope = Converter(scopesByRank)

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
      const databaseScope = convertGrammarScopeToDatabaseScope(scopes)

      let semanticToken
      if (database.primary[databaseScope]) {
        semanticToken = database.primary[databaseScope].semanticToken
      } else if (database.secondary[databaseScope]) {
        semanticToken = database.primary[database.secondary[databaseScope]].semanticToken
      } else {
        semanticToken = database.primary.default.semanticToken
      }

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
