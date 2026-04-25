const fs = require("fs")
const path = require("path")
const vsctm = require("vscode-textmate")
const oniguruma = require("vscode-oniguruma")
const initializeGetDatabaseScope = require("./getDatabaseScope")
const transformForHighlighting = require("./transformForHighlighting")

const initializeHighlight = async database => {
  const { grammars: grammarsRaw, analysis, colorCount } = database

  const grammars = Object.values(grammarsRaw)

  const grammarScopesByRank = {}
  Object.values(analysis).forEach(({ grammarScopeName, scopeData }) => {
    grammarScopesByRank[grammarScopeName] = {}

    scopeData.forEach(({ scopeName, rank }) => {
      if (!grammarScopesByRank[grammarScopeName][rank]) {
        grammarScopesByRank[grammarScopeName][rank] = []
      }
      grammarScopesByRank[grammarScopeName][rank].push(scopeName)
    })
  })

  const { getDatabaseScope } = initializeGetDatabaseScope(grammarScopesByRank)

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

  const { getNestedGrammar } = initializeGetNestedGrammar(
    grammars.map(grammar => grammar.scopeName),
  )

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

    grammarTokens.forEach(({ offset, lineIndex, columnIndex, content, scopes: scopesRaw }) => {
      const [grammarScopeName, scopes] = getNestedGrammar(scopesRaw)

      const databaseScope = getDatabaseScope(scopes)

      let semanticToken
      if (analysis[grammarScopeName][databaseScope]) {
        semanticToken = analysis[grammarScopeName][databaseScope].semanticToken
      } else {
        semanticToken = "color0"
      }

      tokens.push({ offset, lineIndex, columnIndex, content, semanticToken })
    })

    return tokens
  }

  return { highlight }
}

const initializeGetNestedGrammar = grammarScopeNames => {
  const getNestedGrammar = grammarScopeStackRaw => {
    const grammarScopeNameAt =
      grammarScopeStackRaw
        .toReversed() // Nested languages first
        .findIndex(scopeName => grammarScopeNames.includes(scopeName)) + 1

    const grammarScopeName = grammarScopeStackRaw.at(-grammarScopeNameAt)

    // With nested languages disregard the wrapping language scopes
    const grammarScopeStack = grammarScopeStackRaw.slice(-grammarScopeNameAt)

    return [grammarScopeName, grammarScopeStack]
  }

  return { getNestedGrammar }
}

const encodeTokens = tokens => {
  let lastLineIndex = 0
  let lastColumnIndex = 0

  const encodedTokens = []

  tokens.forEach(({ lineIndex, columnIndex, content, semanticToken }) => {
    const semanticTokenIndex = getColorNumber(semanticToken)

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

const getColorNumber = color => {
  return color.match(/(\d+)$/)[1]
}

const tokenModifiersEncoded = convertIntegerArrayToBitmask([0])

module.exports = initializeHighlight
