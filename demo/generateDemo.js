const { createScopeNameToColor } = require("../build-database/utilities")
const Highlighter = require("../index")
const fs = require("fs/promises")
const path = require("path")
const database = require("../database.json")

const generateDemo = async () => {
  const {
    createHighlighter,
    bundledLanguages: bundledLanguagesRaw,
    bundledThemes,
  } = await import("shiki")

  const bundledLanguages = Object.fromEntries(
    Object.entries(bundledLanguagesRaw).filter(([name]) => {
      // prettier-ignore
      return [
        "javascript",
        "json",
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

  const samples = {}

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

  const highlighter = await createHighlighter({
    themes: Object.keys(bundledThemes),
    langs: Object.keys(bundledLanguages),
  })

  const { highlight } = await Highlighter({ languages: Object.values(allGrammars) })

  const results = {}

  Object.entries(samples).map(([languageName, code]) => {
    console.log(`Highlighting ${languageName} sample`)
    results[languageName] = {}

    const grammar = allGrammars[languageName]
    Object.entries(allThemes).forEach(([themeName, theme]) => {
      const start1 = performance.now()
      const { tokens: textmateLines } = highlighter.codeToTokens(code, {
        lang: grammar.name,
        theme,
      })

      results[languageName][themeName] = {}

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

      results[languageName][themeName].textmate = tokens
      const duration1 = performance.now() - start1
      const start2 = performance.now()

      const tokens2 = []
      const { tokens: semanticTokens } = highlight(code, { language: languageName })

      let currentLine = []
      let currentLineIndex = 0

      const lines = code.split("\n")

      semanticTokens.forEach(({ lineIndex, columnIndex, length, semanticToken }) => {
        if (currentLineIndex < lineIndex) {
          currentLineIndex += 1
          tokens2.push(currentLine)
          currentLine = []
        }

        const content = lines[lineIndex].slice(columnIndex, columnIndex + length)

        const { color, fontStyle } = (() => {
          const scopeName = databaseFlipped[semanticToken]
          const colorSettingsString = scopeNameToColor({ scopeName, themeName })
          const colorSettings = JSON.parse(colorSettingsString)
          return { color: colorSettings.color, fontStyle: getFontStyle(colorSettings.fontStyle) }
        })()

        currentLine.push({ content, columnIndex, color, fontStyle })
      })

      tokens2.push(currentLine)

      results[languageName][themeName].semantic = tokens2
      const duration2 = performance.now() - start2
      console.log("textmate", duration1.toFixed(3), "semantic", duration2.toFixed(3))
    })
  })

  const backgroundColors = Object.fromEntries(
    Object.entries(allThemes).map(([themeName, theme]) => {
      return [themeName, theme.colors["editor.background"]]
    }),
  )

  await fs.writeFile(
    path.resolve(__dirname, "./results.json"),
    JSON.stringify({ results, backgroundColors }, null, 2),
    { encoding: "utf8" },
  )
}

const getFontStyle = number => {
  if (number === -1) return undefined
  if (number === 0) return "normal"
  if (number === 1) return "italic"
  if (number === 2) return "bold"
  if (number === 4) return "underline"
  if (number === 8) return "strikethrough"
}

const databaseFlipped = Object.fromEntries(
  Object.entries(database.primary).map(([scope, { semanticToken }]) => [semanticToken, scope]),
)

generateDemo()
