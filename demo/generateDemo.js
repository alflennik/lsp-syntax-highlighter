const convertScopeToSemanticToken = require("../index")
const semanticTokens = require("../semanticTokens.json")
const fs = require("fs/promises")
const path = require("path")

const generateDemo = async () => {
  const { bundledLanguages, bundledThemes } = await import("shiki")

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
    Object.entries(allThemes).map(([name, theme]) => [
      `semantic-${theme.name}`,
      {
        ...theme,
        name: `semantic-${theme.name}`,
        tokenColors: theme.tokenColors.map(tokenColors => {
          if (tokenColors.scope === "comment, punctuation.definition.comment") {
            debugger
          }

          let allScopes = []
          if (tokenColors.scope) {
            if (Array.isArray(tokenColors.scope)) {
              allScopes.push(...tokenColors.scope)
            } else if (tokenColors.scope.includes(",")) {
              allScopes.push(...tokenColors.scope.split(",").map(scope => scope.trim()))
            } else {
              allScopes.push(tokenColors.scope)
            }
          }

          allScopes = allScopes.map(scope => convertScopeToScope(scope))

          const counts = {}
          allScopes.forEach(scope => {
            if (!counts[scope]) counts[scope] = 0
            counts[scope] += 1
          })

          let bestScope
          let highestCount = 0
          Object.entries(counts).forEach(([scope, count]) => {
            if (count > highestCount) {
              highestCount = count
              bestScope = scope
            }
          })

          return {
            ...tokenColors,
            oldScope: tokenColors.scope,
            ...(bestScope && { scope: bestScope }),
          }
        }),
      },
    ]),
  )

  await fs.writeFile(
    path.resolve(__dirname, "./semanticThemes.json"),
    JSON.stringify(semanticThemes, null, 2),
    { encoding: "utf8" },
  )
}

generateDemo()
