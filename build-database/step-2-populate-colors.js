const { createScopeNameToColor, walkObjects } = require("./utilities")
const sqlite3 = require("sqlite3").verbose()

const step2 = async () => {
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

  // const allThemes = await Object.fromEntries(
  //   await Promise.all(
  //     Object.entries(bundledThemes).map(async ([name, importer]) => {
  //       const themeModule = await importer()
  //       return [name, themeModule.default]
  //     }),
  //   ),
  // )

  const allThemeNames = Object.keys(bundledThemes)

  const grammarCustomization = { default: { maxDepth: 4 }, json: { maxDepth: 5 } }

  const grammars = [
    // allGrammars["text.html.basic"],
    allGrammars["source.js"],
    // allGrammars["source.css"],
    allGrammars["source.json"],
  ]

  let allScopeNamesKeyed = {
    default: true, // First color is the one that shows when the color is unknown
  }

  grammars.forEach(grammar => {
    console.info("starting", grammar.name)
    let scopesKeyed = {}

    let iterationCount = 0
    const maxIterationCount = 10_000_000

    const { maxDepth } = grammarCustomization[grammar.name] ?? grammarCustomization.default

    const context = {
      scopeString: `${grammar.scopeName}`,
      depthOfRecursion: Object.fromEntries(Object.keys(grammar.repository).map(name => [name, 0])),
    }

    context.depthOfRecursion.$self = 0

    const handlePattern = (pattern, contextUncloned) => {
      if (!pattern) {
        throw new Error("unexpected")
      }

      const context = structuredClone(contextUncloned) // Avoid issues with reference types

      if (context.scopeString.split(" ").length + 1 > maxDepth) {
        return
      }

      iterationCount += 1
      if (iterationCount > maxIterationCount) {
        throw new Error("Max iteration count exceeded")
      }
      if (iterationCount % 10_000 === 0) {
        console.info(iterationCount, "patterns processed")
      }

      if (pattern.include) {
        if (Object.keys(pattern) > 1) {
          throw new Error("unexpected")
        }

        if (!(pattern.include.startsWith("#") || pattern.include === "$self")) {
          return // embedded language
        }

        const repositoryName = pattern.include === "$self" ? "$self" : pattern.include.slice(1)

        const currentDepthOfRecursion = context.depthOfRecursion[repositoryName]
        if (currentDepthOfRecursion !== 0) return

        context.depthOfRecursion[repositoryName] += 1

        const repository = repositoryName === "$self" ? grammar : grammar.repository[repositoryName]

        if (!repository) return // Typo (happened with HTML)

        handlePattern(repository, context)

        return
      }

      const nameFormatted = pattern.name ? ` ${pattern.name}` : ""

      context.scopeString = `${context.scopeString}${nameFormatted}`

      if (nameFormatted) {
        scopesKeyed[context.scopeString] = true
      }

      Object.values(pattern.beginCaptures ?? {}).map(beginCapture => {
        handlePattern(beginCapture, context)
      })

      Object.values(pattern.captures ?? {}).map(capture => {
        handlePattern(capture, context)
      })

      if (pattern.patterns) {
        pattern.patterns.forEach(pattern => {
          handlePattern(pattern, context)
        })
      }

      Object.values(pattern.endCaptures ?? {}).map(endCapture => {
        handlePattern(endCapture, context)
      })
    }

    grammar.patterns.forEach(pattern => {
      handlePattern(pattern, context)
    })

    // Now eliminate useless scopes

    let scopes = Object.keys(scopesKeyed)

    console.info(scopes.length, "scopes found")

    scopesKeyed = {}

    scopes.forEach((scopeName, index) => {
      if (index !== 0 && index % 500 === 0) {
        console.info(index, "scopes tested")
      }

      const colorsByTheme = Object.fromEntries(
        allThemeNames.map(themeName => {
          const color = scopeNameToColor({ scopeName, themeName })
          return [themeName, color]
        }),
      )

      const splitScopes = scopeName.split(" ").map(nested => nested.split("."))

      for (let i = splitScopes.length - 1; i >= 0; i -= 1) {
        for (let j = splitScopes[i].length - 1; j >= 0; j -= 1) {
          const removed = splitScopes[i].pop()

          const comparison = splitScopes
            .filter(nested => nested.length !== 0)
            .map(nested => nested.join("."))
            .join(" ")

          const comparisonColors = allThemeNames.map(themeName => {
            const color = scopeNameToColor({ scopeName: comparison, themeName })
            return [themeName, color]
          })

          let score = 0
          let total = allThemeNames.length

          comparisonColors.forEach(([themeName, color]) => {
            if (color === colorsByTheme[themeName]) {
              score += 1
            }
          })

          if (score !== total) {
            splitScopes[i].push(removed)
            break
          }
        }
      }

      const simplified = splitScopes
        .filter(nested => nested.length !== 0)
        .map(nested => nested.join("."))
        .join(" ")

      scopesKeyed[simplified] = true
    })

    console.info(Object.keys(scopesKeyed).length, "final scopes found")

    allScopeNamesKeyed = { ...allScopeNamesKeyed, ...scopesKeyed }
  })

  const allScopeNames = Object.keys(allScopeNamesKeyed)

  const db = new sqlite3.Database("./data.db", err => {
    if (err) throw err
  })

  const query = async (sql, parameters = []) => {
    return new Promise(resolve => {
      db.all(sql, parameters, (err, rows) => {
        if (err) throw err
        resolve(rows)
      })
    })
  }

  const themeNamesFormatted = allThemeNames.map(themeName => `('${themeName}')`).join(", ")

  await query(`INSERT INTO themes (name) VALUES ${themeNamesFormatted}`)

  const themes = await query(`SELECT id, name FROM themes`)

  for (scopeName of allScopeNames) {
    const themeColors = themes.map(theme => {
      const color = scopeNameToColor({ scopeName, themeName: theme.name })
      return [theme.id, color]
    })

    await query(`INSERT INTO scopes (name) VALUES ('${scopeName}')`)

    const [scope] = await query(`SELECT * FROM scopes WHERE name = '${scopeName}'`)

    const themeColorsFormatted = themeColors
      .map(([themeId, color]) => `(${themeId}, ${scope.id}, '${color}')`)
      .join(", ")

    await query(`INSERT INTO colors (theme_id, scope_id, color) VALUES ${themeColorsFormatted}`)
  }

  await new Promise(resolve => {
    db.close(err => {
      if (err) throw err
      resolve()
    })
  })
}

step2()
