const { createScopeNameToColor } = require("../compiler/analyzer/utilities")
const initializeHighlighter = require("../index")
const fs = require("fs/promises")
const path = require("path")
const database = require("../database.json")

const initializeDemoHighlight = async () => {
  const {
    createHighlighter,
    bundledLanguages: bundledLanguagesRaw,
    bundledThemes,
  } = await import("shiki")

  const bundledLanguages = Object.fromEntries(
    Object.entries(bundledLanguagesRaw).filter(([name]) => {
      // prettier-ignore
      return [
        "json",
        "javascript",
        "html",
        "sql",
        "markdown",
        "graphql",
        "css",

        // "typescript",
        // "python",
      ].includes(name)
    }),
  )

  const scopeNameToColor = await createScopeNameToColor()

  const allGrammars = await Object.fromEntries(
    await Promise.all(
      Object.entries(bundledLanguages).map(async ([name, importer]) => {
        const imported = await importer()
        const grammar = imported.default.at(-1) // Dependent languages will be listed first
        return [grammar.name, grammar]
      }),
    ),
  )

  const allThemes = await Object.fromEntries(
    await Promise.all(
      Object.entries(bundledThemes).map(async ([name, importer]) => {
        const themeModule = await importer()
        const theme = themeModule.default
        return [name, theme]
      }),
    ),
  )

  const rawResponse = await fetch(
    "https://raw.githubusercontent.com/shikijs/textmate-grammars-themes/refs/heads/main/sources-grammars.ts",
  )
  const response = await rawResponse.text()
  const namesAndAliasesMatches = response.match(/(name: '([^']+)'|aliases: \[[^\]]*\])/g)

  let names = []
  const aliasToName = {}
  let latestName
  namesAndAliasesMatches.forEach(matched => {
    if (matched.startsWith("name:")) {
      latestName = matched.match(/name: '(.*)'/)[1]
      aliasToName[latestName] = latestName
      names.push(latestName)
    } else if (matched.startsWith("aliases")) {
      const aliases = matched.match(/'([^']+)'/g)
      aliases.forEach(alias => {
        aliasToName[alias.slice(1, -1)] = latestName
      })
    }
  })

  names = names.filter(name => allGrammars[name]).sort((a, b) => a.localeCompare(b))

  let samples = {}

  await Promise.all(
    names.map(async name => {
      const response = await fetch(
        `https://raw.githubusercontent.com/shikijs/textmate-grammars-themes/refs/heads/main/samples/${name}.sample`,
      )
      if (response.ok) {
        samples[name] = await response.text()
      }
    }),
  )

  samples = Object.fromEntries(Object.entries(samples).sort((a, b) => a[0].localeCompare(b[0])))

  const highlighter = await createHighlighter({
    themes: Object.keys(bundledThemes),
    langs: Object.keys(bundledLanguages),
  })

  const { highlight } = await initializeHighlighter({ grammars: Object.values(allGrammars) })

  const demoHighlight = ({ themeName, grammarName }) => {
    const sample = samples[grammarName]
    const theme = allThemes[themeName]
    const grammar = allGrammars[grammarName]

    if (!sample) throw new Error("No matching sample found")
    if (!theme) throw new Error("Theme not found")
    if (!grammar) throw new Error("Grammar not found")

    console.info(`Highlighting ${grammarName} sample`)

    const results = {}

    const start1 = performance.now()
    const { tokens: textmateLines } = highlighter.codeToTokens(sample, {
      lang: grammar.name,
      theme,
    })

    let lastOffset = 0
    const tokens = textmateLines.map(textmateTokens => {
      let columnOffset = lastOffset
      return textmateTokens.map(textmateToken => {
        lastOffset = textmateToken.offset + textmateToken.content.length + 1 // + 1 for newlines
        return {
          content: textmateToken.content,
          columnIndex: textmateToken.offset - columnOffset,
          color: textmateToken.color,
          fontStyle: getFontStyle(textmateToken.fontStyle),
        }
      })
    })

    results.textmate = tokens
    const duration1 = performance.now() - start1
    const start2 = performance.now()

    const tokens2 = []
    const { tokens: semanticTokens } = highlight({
      text: sample,
      sections: [{ startOffset: 0, endOffset: sample.length, grammar: grammarName }],
    })

    semanticTokens.forEach(({ lineIndex, columnIndex, content, semanticToken }) => {
      const { scopeNameRemaining, grammarName } = semanticTokenLookups[semanticToken]
      const scopeName = `${grammarName} ${scopeNameRemaining}`

      const { color, fontStyle } = (() => {
        const colorSettingsString = scopeNameToColor({ scopeName, themeName })
        const colorSettings = JSON.parse(colorSettingsString)
        return { color: colorSettings.color, fontStyle: getFontStyle(colorSettings.fontStyle) }
      })()

      if (!tokens2[lineIndex]) tokens2[lineIndex] = []

      tokens2[lineIndex].push({
        content,
        columnIndex,
        color,
        fontStyle,
        // scopeName, // for debugging
        // semanticToken, // for debugging
      })
    })

    for (let i = 0; i < tokens2.length; i += 1) {
      if (!tokens2[i]) tokens2[i] = []
    }

    results.semantic = tokens2
    const duration2 = performance.now() - start2
    console.info("textmate", duration1.toFixed(3), "semantic", duration2.toFixed(3))

    return results
  }

  const backgroundColors = Object.fromEntries(
    Object.entries(allThemes).map(([themeName, theme]) => {
      return [themeName, theme.colors["editor.background"]]
    }),
  )

  const themeNames = Object.keys(allThemes)
  const grammarNames = Object.keys(allGrammars)

  return { demoHighlight, backgroundColors, themeNames, grammarNames }
}

const getFontStyle = number => {
  if (number === -1) return undefined
  if (number === 0) return "normal"
  if (number === 1) return "italic"
  if (number === 2) return "bold"
  if (number === 4) return "underline"
  if (number === 8) return "strikethrough"
}

const semanticTokenLookups = {}
Object.entries(database).forEach(([grammarName, grammarScopes]) => {
  Object.entries(grammarScopes).forEach(([scopeNameRemaining, { semanticToken }]) => {
    semanticTokenLookups[semanticToken] = { grammarName, scopeNameRemaining }
  })
})

module.exports = initializeDemoHighlight
