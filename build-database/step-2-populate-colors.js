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

  const allThemes = await Object.fromEntries(
    await Promise.all(
      Object.entries(bundledThemes).map(async ([name, importer]) => {
        const themeModule = await importer()
        return [name, themeModule.default]
      }),
    ),
  )

  const allScopesInThemes = {}
  const cleanScope = scope => {
    return scope.replace(/[ ,>*|]/g, "")
  }
  Object.values(allThemes).forEach(theme => {
    theme.tokenColors.forEach(tokenColorSet => {
      if (tokenColorSet.scope) {
        if (Array.isArray(tokenColorSet.scope)) {
          tokenColorSet.scope.forEach(scope => {
            scope.split(" ").forEach(scope => {
              if (scope.match(/[ ,>*|]/ || scope.match(/^[.\-]/))) return
              allScopesInThemes[cleanScope(scope)] = true
            })
          })
        } else if (tokenColorSet.scope.includes(",")) {
          tokenColorSet.scope.split(",").forEach(scope => {
            scope.split(" ").forEach(scope => {
              if (scope.match(/[ ,>*|]/ || scope.match(/^[.\-]/))) return
              allScopesInThemes[cleanScope(scope)]
            })
          })
        } else {
          tokenColorSet.scope.split(" ").forEach(scope => {
            if (scope.match(/[ ,>*|]/ || scope.match(/^[.\-]/))) return
            allScopesInThemes[cleanScope(scope)]
          })
        }
      }
    })
  })
  const scopeUsedInThemes = scope => {
    if (allScopesInThemes[scope]) return true
    const segments = scope.split(".")
    let iterationCount = 0
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      iterationCount += 1
      // punctuation.definition.string.begin.js shouldn't match punctuation.definition
      if (iterationCount > 3) return false
      // support.variable.property.target.js shouldn't match just support
      if (i === 1) return false

      if (allScopesInThemes[segments.slice(0, i).join(".")]) return true
    }
    return false
  }

  const allThemeNames = Object.keys(bundledThemes)

  const grammarCustomization = {
    default: { maxDepth: 4, maxRecursion: 1 },
    html: { maxDepth: 7, maxRecursion: 4 },
    css: { maxDepth: 5, maxRecursion: 2 },
    json: { maxDepth: 10, maxRecursion: 10 },
    javascript: { maxDepth: 6, maxRecursion: 1, allowPotentialDeadEnds: false },
    python: { maxDepth: 7, maxRecursion: 1 },
  }

  const grammars = [
    allGrammars["text.html.basic"],
    allGrammars["source.js"],
    allGrammars["source.css"],
    allGrammars["source.json"],
    allGrammars["source.python"],
  ]

  let allScopeDataByName = {
    default: {}, // Default is not a real scope so it shows the color when the scope is unknown
  }

  grammars.forEach(grammar => {
    console.info("starting", grammar.name)
    let scopesKeyed = {}

    let iterationCount = 0
    const maxIterationCount = 10_000_000

    const {
      maxDepth,
      maxRecursion,
      allowPotentialDeadEnds = true,
    } = grammarCustomization[grammar.name] ?? grammarCustomization.default

    const context = {
      scopeString: `${grammar.scopeName}`,
      depthOfRecursion: Object.fromEntries(Object.keys(grammar.repository).map(name => [name, 0])),
    }

    context.depthOfRecursion.$self = 0

    const handlePattern = (pattern, contextUncloned) => {
      if (!allowPotentialDeadEnds && pattern.name && !scopeUsedInThemes(pattern.name)) {
        // console.log("no", pattern.name)
        return
      } else if (pattern.name) {
        // console.log("yes", pattern.name)
      }

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
        if (currentDepthOfRecursion >= maxRecursion) return

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

    scopeDataByName = {}

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

      if (
        !scopeDataByName[simplified] ||
        // The shortest scope stack associated with the simplified scope usually gets better ranking
        // results in step 4
        scopeDataByName[simplified].originalScopeStack.length > scopeName
      )
        scopeDataByName[simplified] = {
          // Technically multiple scope stacks will produce the same simplified scope, but for now I
          // will see if only persisting one still produces good results
          originalScopeStack: scopeName,
        }
    })

    console.info(Object.keys(scopeDataByName).length, "final scopes found")

    allScopeDataByName = { ...allScopeDataByName, ...scopeDataByName }
  })

  // Get remaining scopes directly from themes
  // Object.values(allThemes).forEach(theme => {
  //   theme.tokenColors.forEach(tokenColorSet => {
  //     if (!tokenColorSet?.settings?.foreground) {
  //       // One feature Textmate Grammars support is "falling through" - basically it's possible to
  //       // decouple the font style, background color and text color across different selectors.
  //       // I haven't figured out a way to replicate this, so I decided to discard settings that omit
  //       // a text color, basically it's better to get the color right than the font style
  //       return
  //     }

  //     // ">" Not supported now, maybe later
  //     if (Array.isArray(tokenColorSet.scope)) {
  //       tokenColorSet.scope = tokenColorSet.scope?.filter(scope => !scope.includes(">"))
  //       if (!tokenColorSet.scope?.length) return
  //     } else if (tokenColorSet.scope?.includes(">")) {
  //       return
  //     }

  //     const allScopes = []
  //     if (tokenColorSet.scope) {
  //       if (Array.isArray(tokenColorSet.scope)) {
  //         allScopes.push(...tokenColorSet.scope)
  //       } else if (tokenColorSet.scope.includes(",")) {
  //         allScopes.push(...tokenColorSet.scope.split(",").map(scope => scope.trim()))
  //       } else {
  //         allScopes.push(tokenColorSet.scope)
  //       }
  //     }

  //     allScopes.forEach(scope => {
  //       allScopeDataByName[scope] = true
  //     })
  //   })
  // })

  const allScopeData = Object.entries(allScopeDataByName).map(
    ([scopeName, { originalScopeStack }]) => ({ scopeName, originalScopeStack }),
  )

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

  await query(`DELETE FROM themes`)
  await query(`DELETE FROM scopes`)
  await query(`DELETE FROM colors`)

  await query(`INSERT INTO themes (name) VALUES ${themeNamesFormatted}`)

  const themes = await query(`SELECT id, name FROM themes`)

  for ({ scopeName, originalScopeStack } of allScopeData) {
    const themeColors = themes.map(theme => {
      const color = scopeNameToColor({ scopeName, themeName: theme.name })
      return [theme.id, color]
    })

    const originalScopeStackFormatted =
      originalScopeStack == null ? null : `'${originalScopeStack}'`

    await query(`
      INSERT INTO scopes (name, original_scope_stack) 
      VALUES ('${scopeName}', ${originalScopeStackFormatted})
    `)

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
