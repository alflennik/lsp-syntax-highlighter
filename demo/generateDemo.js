const { createScopeNameToColor } = require("../build-database/utilities")
const convertScopeToSemanticToken = require("../index")
const semanticTokens = require("../semanticTokens.json")
const fs = require("fs/promises")
const path = require("path")

const generateDemo = async () => {
  const { bundledLanguages, bundledThemes } = await import("shiki")
  const scopeNameToColor = await createScopeNameToColor()

  const allGrammars = await Object.fromEntries(
    await Promise.all(
      Object.entries(bundledLanguages).map(async ([name, importer]) => {
        const imported = await importer()
        const grammar = imported.default.at(-1) // Dependent languages will be listed first
        return [grammar.scopeName, grammar]
      }),
    ),
  )

  const allThemes = await Object.fromEntries(
    await Promise.all(
      Object.entries(bundledThemes).map(async ([name, importer]) => {
        const themeModule = await importer()
        return [name, themeModule.default]
      }),
    ),
  )

  // Just simulate using semantic tokens instead of actually using them
  const convertScopeToScope = scope => {
    if (!semanticTokens[convertScopeToSemanticToken(scope)]) {
      console.log()
    }
    return semanticTokens[convertScopeToSemanticToken(scope)]
  }

  const semanticThemes = Object.fromEntries(
    Object.values(allThemes).map(theme => {
      const semanticTokensToColors = Object.fromEntries(
        Object.entries(semanticTokens).map(([semanticToken, scopeName]) => {
          const color = scopeNameToColor({ scopeName, themeName: theme.name })
          return [semanticToken, color]
        }),
      )

      const allScopes = []
      theme.tokenColors.forEach(tokenColorSet => {
        if (tokenColorSet.scope) {
          if (Array.isArray(tokenColorSet.scope)) {
            allScopes.push(...tokenColorSet.scope)
          } else if (tokenColorSet.scope.includes(",")) {
            allScopes.push(...tokenColorSet.scope.split(",").map(scope => scope.trim()))
          } else {
            allScopes.push(tokenColorSet.scope)
          }
        }
      })

      // console.log(typeof person) // object

      const tokenColors = []
      allScopes.forEach(scopeName => {
        const semanticToken = convertScopeToSemanticToken(scopeName)
        const shikiSettings = JSON.parse(semanticTokensToColors[semanticToken])

        const settings = {
          foreground: shikiSettings.color,
          fontStyle: (() => {
            if (shikiSettings.fontStyle === -1) return undefined
            if (shikiSettings.fontStyle === 0) return "normal"
            if (shikiSettings.fontStyle === 1) return "italic"
            if (shikiSettings.fontStyle === 2) return "bold"
            if (shikiSettings.fontStyle === 4) return "underline"
            if (shikiSettings.fontStyle === 8) return "strikethrough"
          })(),
        }

        tokenColors.push({ scope: scopeName, settings })
      })

      const semanticThemeName = `semantic-${theme.name}`

      return [semanticThemeName, { ...theme, name: semanticThemeName, tokenColors }]
    }),
  )

  await fs.writeFile(
    path.resolve(__dirname, "./semanticThemes.json"),
    JSON.stringify(semanticThemes, null, 2),
    { encoding: "utf8" },
  )
}

generateDemo()
