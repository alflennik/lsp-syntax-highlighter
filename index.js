const fs = require("fs")
const path = require("path")
const vsctm = require("vscode-textmate")
const oniguruma = require("vscode-oniguruma")
const colors = require("./colors.json")
const database = require("./database.json")
const initializeConverter = require("./library/convertGrammarScopeToDatabaseScope")

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
    throw new Error("no grammars were provided")
  }

  const { convertGrammarScopeToDatabaseScope } = initializeConverter(scopesByRank)

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

  const registry = new vsctm.Registry({
    onigLib: vscodeOnigurumaLib,
    loadGrammar: scopeName => {
      return languages.find(language => language.scopeName === scopeName)
    },
  })

  const grammars = {}
  for (const language of languages) {
    grammars[language.name] = await registry.loadGrammar(language.scopeName)
  }

  const tokensUnsorted = []

  const highlightSection = ({
    lines,
    grammar: grammarName,
    startLineOffset,
    startColumnOffset,
    skippedSections,
  }) => {
    if (!grammarName) throw new Error("grammar cannot be undefined")
    const grammar = grammars[grammarName]
    if (!grammar) {
      const grammarsFormatted = grammars.map(grammar => grammar.name).join(", ")
      throw new Error(
        `grammar for ${grammarName} not found (provided grammars: ${grammarsFormatted})`,
      )
    }

    const indexes = {}
    lines.forEach((line, sectionLineIndex) => {
      line.split("").forEach((character, sectionColumnIndex) => {
        const lineIndex = sectionLineIndex + startLineOffset
        const columnIndex =
          sectionLineIndex === 0 ? sectionColumnIndex + startColumnOffset : sectionColumnIndex
        indexes[`${sectionLineIndex}:${sectionColumnIndex}`] = [lineIndex, columnIndex]
      })
    })

    const grammarTokens = []

    let vsctmContext = vsctm.INITIAL
    lines.forEach((line, sectionLineIndex) => {
      const lineTokens = grammar.tokenizeLine(line, vsctmContext)

      lineTokens.tokens.forEach(
        ({ startIndex: sectionColumnIndex, endIndex: sectionColumnEndIndex, scopes }) => {
          const content = line.slice(sectionColumnIndex, sectionColumnEndIndex)
          grammarTokens.push({ sectionLineIndex, sectionColumnIndex, content, scopes })
        },
      )

      vsctmContext = lineTokens.ruleStack
    })

    grammarTokens.forEach(({ sectionLineIndex, sectionColumnIndex, content, scopes }) => {
      const databaseScope = convertGrammarScopeToDatabaseScope(scopes)

      let semanticToken
      if (database.primary[databaseScope]) {
        semanticToken = database.primary[databaseScope].semanticToken
      } else if (database.secondary[databaseScope]) {
        semanticToken = database.primary[database.secondary[databaseScope]].semanticToken
      } else {
        semanticToken = database.primary.default.semanticToken
      }

      tokens.push({ sectionLineIndex, sectionColumnIndex, content, semanticToken })
    })

    return tokens
  }

  const highlight = ({ lines, sections }) => {
    const sectionLines = {}

    sections.forEach((section, sectionIndex) => {
      const firstLine = lines[section.startLineIndex].slice(startColumnIndex)
      const hasTwoOrMoreLines = section.endLineIndex - section.startLineIndex >= 2
      const hasThreeOrMoreLines = section.endLineIndex - section.startLineIndex >= 3
      let middleLines
      if (hasThreeOrMoreLines) {
        middleLines = lines.slice(section.startLineIndex + 1, section.endLineIndex - 1)
      }
      let lastLine
      if (hasTwoOrMoreLines) {
        lastLine = lines[section.endLineIndex].slice(0, endColumnIndex)
      }
      sectionLines[sectionIndex] = [
        firstLine,
        ...(middleLines ?? []),
        ...(lastLine ? [lastLine] : []),
      ]
    })
  }

  const highlightMultiple = optionsArray => {
    const allTokens = []

    optionsArray.forEach(options => {
      // The encodedTokens returned from highlight don't factor in the fact that there might be
      // multiple highlighted portions in one file. The tokens variable is unaffected since it uses
      // actual line indexes, however the encodedTokens breaks because it contains deltas. That's
      // why the tokens need to be collected and then encoded together at the end.
      const { tokens } = highlight(options)

      allTokens.push(...tokens)
    })

    const encodedTokens = encodeTokens(allTokens)

    return { encodedTokens: encodedTokens, tokens: allTokens }
  }

  return { highlight, highlightMultiple }
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
