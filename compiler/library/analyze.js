const { initializeScopeNameToColor, requireWithLocalMode } = require("./utilities")
const initializeGetDatabaseScope = requireWithLocalMode(
  "lsp-syntax-highlighter/library/getDatabaseScope",
  process.env.LOCAL_PACKAGES,
)

const analyze = async ({ grammar, themes }) => {
  console.info("⚠️ Note: This process can take more than an hour to complete.")
  await new Promise(resolve => setTimeout(resolve, 3000))

  console.info("\nStarting analysis for", grammar.name, "grammar.")

  const { scopeNameToColor } = await initializeScopeNameToColor()

  const allScopesInThemes = {}

  const cleanScope = scope => {
    return scope.replace(/[ ,>*|]/g, "")
  }

  Object.values(themes).forEach(theme => {
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
              allScopesInThemes[cleanScope(scope)] = true
            })
          })
        } else {
          tokenColorSet.scope.split(" ").forEach(scope => {
            if (scope.match(/[ ,>*|]/ || scope.match(/^[.\-]/))) return
            allScopesInThemes[cleanScope(scope)] = true
          })
        }
      }
    })
  })

  const scopeUsedInThemes = scope => {
    scope = scope.split(" ").at(-1) // For themes that output two scopes in one, check the last one
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

  const allThemeNames = Object.keys(themes)

  const trialSearchDepths = [
    { maxDepth: 10, maxRecursion: 10 },
    { maxDepth: 9, maxRecursion: 4 },
    { maxDepth: 8, maxRecursion: 4 },
    { maxDepth: 7, maxRecursion: 4 },
    { maxDepth: 8, maxRecursion: 3 },
    { maxDepth: 7, maxRecursion: 3 },
    { maxDepth: 7, maxRecursion: 2 },
    { maxDepth: 6, maxRecursion: 2 },
    { maxDepth: 5, maxRecursion: 2 },
    { maxDepth: 7, maxRecursion: 1 },
    { maxDepth: 7, maxRecursion: 1, allowPotentialDeadEnds: false },
    { maxDepth: 6, maxRecursion: 1, allowPotentialDeadEnds: false },
    { maxDepth: 5, maxRecursion: 1, allowPotentialDeadEnds: false },
    { maxDepth: 4, maxRecursion: 1, allowPotentialDeadEnds: false },
  ]

  // default: { maxDepth: 4, maxRecursion: 1, allowPotentialDeadEnds: true },
  // html: { maxDepth: 7, maxRecursion: 4 },
  // css: { maxDepth: 5, maxRecursion: 2 },
  // json: { maxDepth: 10, maxRecursion: 10 },
  // javascript: { maxDepth: 6, maxRecursion: 1, allowPotentialDeadEnds: false },
  // sql: { maxDepth: 10, maxRecursion: 10 },
  // markdown: { maxDepth: 7, maxRecursion: 2 },
  // graphql: { maxDepth: 8, maxRecursion: 3 },
  // typescript: { maxDepth: 6, maxRecursion: 1, allowPotentialDeadEnds: false },
  // python: { maxDepth: 7, maxRecursion: 1 },

  const attemptProcessingGrammar = ({ searchDepth, allPossibleScopesKeyed }) => {
    let iterationCount = 0
    const maxIterationCount = 1_000_000
    const maxResults = 5_000
    // const maxIterationCount = 30_000_000
    // const maxResults = 500_000

    const { maxDepth, maxRecursion, allowPotentialDeadEnds = true } = searchDepth

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

      if (!allowPotentialDeadEnds && pattern.name && !scopeUsedInThemes(pattern.name)) {
        if (!context.potentialDeadEndBranch) {
          context.potentialDeadEndBranch = true // Only exit after two useless scopes
        } else {
          return
        }
      }

      if (context.scopeString.split(" ").length + 1 > maxDepth) {
        return
      }

      iterationCount += 1
      if (iterationCount > maxIterationCount) {
        throw new Error("Max iteration count exceeded")
      }
      if (iterationCount % 500_000 === 0) {
        console.info(iterationCount, "scopes processed ...")
      }
      if (
        iterationCount % 100_000 === 0 &&
        Object.keys(allPossibleScopesKeyed).length > maxResults
      ) {
        throw new Error("Max results exceeded")
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
        allPossibleScopesKeyed[context.scopeString] = true
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

      // "contentName" is similar to "name" but does not wrap the beginCapture / endCapture etc.
      if (pattern.contentName) {
        allPossibleScopesKeyed[`${context.scopeString} ${pattern.contentName}`] = true
      }
    }

    grammar.patterns.forEach(pattern => {
      handlePattern(pattern, context)
    })

    if (Object.keys(allPossibleScopesKeyed).length > maxResults) {
      throw new Error("Max results exceeded")
    }
  }

  console.info("\nIdentifying all scopes grammar can produce ...")

  let allPossibleScopesKeyed

  for (let i = 0; i < trialSearchDepths.length; i += 1) {
    console.info("Attempt", i + 1, "of", trialSearchDepths.length, "...")

    const searchDepth = trialSearchDepths[i]

    allPossibleScopesKeyed = {}

    try {
      attemptProcessingGrammar({ searchDepth, allPossibleScopesKeyed })
    } catch (error) {
      if (
        error.message === "Max iteration count exceeded" ||
        error.message === "Max results exceeded"
      ) {
        continue
      }
      throw error
    }

    console.info("Succeeded.", Object.keys(allPossibleScopesKeyed).length, "scopes found.")

    break
  }

  const totalScopeCount = Object.keys(allPossibleScopesKeyed).length

  console.info("\nCombining similar scopes...")

  let meaningfulScopesKeyed = {}

  Object.keys(allPossibleScopesKeyed).forEach((scopeName, index) => {
    if (index !== 0 && index % 500 === 0) {
      console.info(index, "of", totalScopeCount, "scopes combined ...")
    }

    const colorsByTheme = Object.fromEntries(
      allThemeNames.map(themeName => {
        const color = scopeNameToColor({ scopeName, themeName })
        return [themeName, color]
      }),
    )

    const splitScopes = scopeName.split(" ").map(nested => nested.split("."))

    for (let i = splitScopes.length - 1; i >= 0; i -= 1) {
      if (i === 0) break // keep the source.js part to make sure different languages don't clash

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
      !meaningfulScopesKeyed[simplified] ||
      // The shortest scope stack associated with the simplified scope usually gets better ranking
      // results in step 4
      meaningfulScopesKeyed[simplified].originalScopeStack.length > scopeName
    ) {
      meaningfulScopesKeyed[simplified] = {
        // Technically multiple scope stacks will produce the same simplified scope, but for now I
        // will see if only persisting one still produces good results
        originalScopeStack: scopeName,
      }
    }
  })

  meaningfulScopesKeyed = Object.fromEntries(
    Object.entries(meaningfulScopesKeyed).filter(([scopeName]) =>
      // Names without spaces are "source.js" or "source.css" which are not useful
      scopeName.includes(" "),
    ),
  )

  console.info("Succeeded.", Object.keys(meaningfulScopesKeyed).length, "unique scopes remain.")

  const scopes = Object.entries(meaningfulScopesKeyed).map(
    ([scopeName, { originalScopeStack }]) => ({ scopeName, originalScopeStack }),
  )

  console.info("\nApplying rankings to fix specificity issues ...")
  // Default is not a real scope so it shows the color when the scope is unknown

  const ranksByScopeName = {}
  scopes.forEach(({ scopeName }) => {
    const firstSpace = scopeName.indexOf(" ")
    const scopeNameRemaining = scopeName.slice(firstSpace + 1)

    ranksByScopeName[scopeNameRemaining] = 0
  })

  const maximumRank = 20

  for (let i = 0; i < maximumRank; i += 1) {
    console.info("Pass", i + 1, "of", maximumRank, "...")

    let isDone = true

    const scopesByRank = {}
    Object.entries(ranksByScopeName).forEach(([scopeName, rank]) => {
      if (!scopesByRank[rank]) {
        scopesByRank[rank] = []
      }
      scopesByRank[rank].push(scopeName)
    })

    const { getDatabaseScope } = initializeGetDatabaseScope({ [grammar.scopeName]: scopesByRank })

    scopes.forEach(({ scopeName, originalScopeStack }, index) => {
      if (index % 1000 === 0 && index !== 0) {
        console.info("ranking", index, "of", scopes.length, "...")
      }

      const firstSpace = scopeName.indexOf(" ")
      const scopeNameRemaining = scopeName.slice(firstSpace + 1)

      const matchedScope = getDatabaseScope(originalScopeStack.split(" "))
      if (matchedScope !== scopeNameRemaining) {
        isDone = false
        ranksByScopeName[scopeNameRemaining] += 1
      }
    })

    if (isDone) break
  }

  const analysis = { grammarName: grammar.name, grammarScopeName: grammar.scopeName, scopeData: [] }

  Object.entries(ranksByScopeName).forEach(([scopeNameRemaining, rank]) => {
    analysis.scopeData.push({ scopeName: scopeNameRemaining, rank })
  })

  console.info("Succeeded. Ranking complete.")
  console.info("\nAnalysis complete.")

  return analysis
}

module.exports = analyze
