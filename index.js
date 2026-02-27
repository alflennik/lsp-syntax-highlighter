const fakeScopeMatchingTheme = require("./database.json")
const colors = require("./colors.json")
// const semanticTokens = require("./semanticTokens.json")

const colorsToIndexes = Object.fromEntries(
  colors.map((color, index) => {
    return [color, index]
  }),
)

const Highlighter = async ({ languages }) => {
  const { createHighlighter } = await import("shiki")

  const highlighter = await createHighlighter({
    themes: [fakeScopeMatchingTheme],
    langs: languages,
  })

  const highlight = (code, { language, lineOffset = 0, columnOffset = 0 }) => {
    const { tokens: lineTokens } = highlighter.codeToTokens(code, {
      lang: language,
      theme: "fake-scope-matching-theme",
    })

    const tokens = []

    lineTokens.forEach((line, lineIndex) => {
      line.forEach(({ content, offset, color }) => {
        const number = convertCssHexToNumber(color)
        const semanticToken = `color${number}`

        tokens.push({
          lineIndex: lineOffset + lineIndex,
          startIndex: columnOffset + offset,
          length: content.length,
          semanticToken,
        })
      })
    })

    let lastLineIndex = 0
    let lastStartIndex = 0

    const encodedTokens = []

    tokens.forEach(({ lineIndex, startIndex, length, semanticToken }) => {
      const semanticTokenIndex = colorsToIndexes[semanticToken]

      encodedTokens.push(
        lineIndex - lastLineIndex,
        startIndex - lastStartIndex,
        length,
        semanticTokenIndex,
        tokenModifiersEncoded,
      )

      lastLineIndex = lineIndex
      lastStartIndex = startIndex
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

const convertCssHexToNumber = hex => parseInt(hex.replace("#", ""))

const tokenModifiersEncoded = convertIntegerArrayToBitmask([0])

module.exports = Highlighter
