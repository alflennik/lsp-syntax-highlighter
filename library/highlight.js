const fs = require("fs")
const path = require("path")
const vsctm = require("vscode-textmate")
const oniguruma = require("vscode-oniguruma")
const colors = require("../colors.json")
const database = require("../database.json")
const initializeGetDatabaseScope = require("./getDatabaseScope")
const transformForHighlighting = require("./transformForHighlighting")

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

const initializeHighlighter = async ({ grammars } = {}) => {
  if (!grammars || !grammars.length) {
    throw new Error("no grammars provided")
  }

  const { getDatabaseScope } = initializeGetDatabaseScope(scopesByRank)

  // See https://www.npmjs.com/package/vscode-textmate
  const wasmBin = fs.readFileSync(
    path.join(__dirname, "../node_modules/vscode-oniguruma/release/onig.wasm"),
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

  const registry = new vsctm.Registry({
    onigLib: vscodeOnigurumaLib,
    loadGrammar: scopeName => {
      return grammars.find(grammar => grammar.scopeName === scopeName)
    },
  })

  const vsctmGrammars = {}
  for (const grammar of grammars) {
    vsctmGrammars[grammar.name] = await registry.loadGrammar(grammar.scopeName)
  }

  const highlight = ({ text, sections }) => {
    const tokens = []

    sections.forEach(section => {
      const { transformed, convertIndexes } = transformForHighlighting({ text, section })

      const tokensTransformed = highlightSection({
        text: transformed,
        grammarName: section.grammar,
      })

      tokensTransformed.forEach(tokenTransformed => {
        const indexes = convertIndexes(tokenTransformed.offset)

        if (indexes) {
          tokens.push({
            offset: indexes.originalOffset,
            lineIndex: indexes.originalLineIndex,
            columnIndex: indexes.originalColumnIndex,
            content: tokenTransformed.content,
            semanticToken: tokenTransformed.semanticToken,
          })
        }
      })
    })

    tokens.sort((a, b) => a.offset - b.offset)

    const encodedTokens = encodeTokens(tokens)

    return { encodedTokens, tokens }
  }

  const highlightSection = ({ text, grammarName }) => {
    if (!grammarName) throw new Error("grammar cannot be undefined")
    const vsctmGrammar = vsctmGrammars[grammarName]
    if (!vsctmGrammar) {
      const grammarsFormatted = grammars.map(grammar => grammar.name).join(", ")
      throw new Error(
        `grammar for ${grammarName} not found (provided grammars: ${grammarsFormatted})`,
      )
    }

    const grammarTokens = []

    let offset = 0
    let vsctmContext = vsctm.INITIAL
    text.split("\n").forEach((line, lineIndex) => {
      if (lineIndex !== 0) {
        offset += 1 // make sure offset accounts for newlines
      }

      if (!line) return

      const lineTokens = vsctmGrammar.tokenizeLine(line, vsctmContext)

      lineTokens.tokens.forEach(({ startIndex: columnIndex, endIndex: endColumnIndex, scopes }) => {
        const content = line.slice(columnIndex, endColumnIndex)
        grammarTokens.push({ offset, lineIndex, columnIndex, content, scopes })

        offset += content.length
      })

      vsctmContext = lineTokens.ruleStack
    })

    const tokens = []

    grammarTokens.forEach(({ offset, lineIndex, columnIndex, content, scopes }) => {
      const databaseScope = getDatabaseScope(scopes)

      let semanticToken
      if (database.primary[databaseScope]) {
        semanticToken = database.primary[databaseScope].semanticToken
      } else if (database.secondary[databaseScope]) {
        semanticToken = database.primary[database.secondary[databaseScope]].semanticToken
      } else {
        semanticToken = database.primary.default.semanticToken
      }

      tokens.push({ offset, lineIndex, columnIndex, content, semanticToken })
    })

    return tokens
  }

  return { highlight }
}

const encodeTokens = tokens => {
  let lastLineIndex = 0
  let lastColumnIndex = 0

  const encodedTokens = []

  tokens.forEach(({ lineIndex, columnIndex, content, semanticToken }) => {
    const semanticTokenIndex = colorsToIndexes[semanticToken]

    encodedTokens.push(
      lineIndex - lastLineIndex,
      // Ignore the previous column index if it's a new line
      lastLineIndex === lineIndex ? columnIndex - lastColumnIndex : columnIndex,
      content.length,
      semanticTokenIndex,
      tokenModifiersEncoded,
    )

    lastLineIndex = lineIndex
    lastColumnIndex = columnIndex
  })

  return encodedTokens
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

module.exports = initializeHighlighter
