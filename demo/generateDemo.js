const { createScopeNameToColor } = require("../build-database/utilities")
const convertScopeToSemanticToken = require("../index")
const semanticTokens = require("../semanticTokens.json")
const fs = require("fs/promises")
const path = require("path")

const generateDemo = async () => {
  const { /* bundledLanguages, */ bundledThemes } = await import("shiki")
  const scopeNameToColor = await createScopeNameToColor()

  // const allGrammars = await Object.fromEntries(
  //   await Promise.all(
  //     Object.entries(bundledLanguages).map(async ([name, importer]) => {
  //       const imported = await importer()
  //       const grammar = imported.default.at(-1) // Dependent languages will be listed first
  //       return [grammar.scopeName, grammar]
  //     }),
  //   ),
  // )

  const allThemes = await Object.fromEntries(
    await Promise.all(
      Object.entries(bundledThemes).map(async ([name, importer]) => {
        const themeModule = await importer()
        const theme = themeModule.default
        const themeFixed = {
          ...theme,
          tokenColors: theme.tokenColors.filter(tokenColorSet => {
            // One feature Textmate Grammars support is "falling through" - basically it's possible to
            // decouple the font style, background color and text color across different selectors.
            // I haven't figured out a way to replicate this, so I decided to discard settings that omit
            // a text color, basically it's better to get the color right than the font style
            return !!tokenColorSet?.settings?.foreground
          }),
        }
        return [name, themeFixed]
      }),
    ),
  )

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

      const tokenColors = []
      allScopes.forEach(scopeName => {
        const semanticToken = convertScopeToSemanticToken(scopeName)
        if (!semanticTokensToColors[semanticToken]) {
          debugger
        }
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

  names = names.sort((a, b) => a.localCompare(b))

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

  await fs.writeFile(
    path.resolve(__dirname, "./semanticThemes.json"),
    JSON.stringify(semanticThemes, null, 2),
    { encoding: "utf8" },
  )

  await fs.writeFile(
    path.resolve(__dirname, "./samples.json"),
    JSON.stringify([aliasToName, samples], null, 2),
    { encoding: "utf8" },
  )
}

generateDemo()
