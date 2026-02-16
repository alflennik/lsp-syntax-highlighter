const omit = require("lodash.omit")
const sqlite3 = require("sqlite3").verbose()

const step2 = async () => {
  const { createHighlighter, bundledLanguages, bundledThemes } = await import("shiki")

  const allGrammars = await Object.fromEntries(
    await Promise.all(
      Object.entries(bundledLanguages).map(async ([name, importer]) => {
        const imported = await importer()
        const grammar = imported.default.at(-1) // Dependent languages will be listed first
        return [grammar.scopeName, grammar]
      }),
    ),
  )

  const allScopeNamesKeyed = {}
  Object.values(allGrammars).forEach(grammar => {
    walkObjects(grammar, object => {
      const isPattern = object.scopeName === undefined
      if (object.name && isPattern) {
        const isValidName = typeof object.name === "string"
        if (!isValidName) return

        // These mandate specific formatting (e.g. markup.underline, markup.italic) and clash with
        // the whole concept of semantic tokens
        if (object.name.includes("markup")) return

        // Handle spaces, which can be used to apply multiple names to one token
        const names = object.name.split(" ")

        names.forEach(name => {
          allScopeNamesKeyed[name] = true

          // Make sure to include the parent scopes, so for "string.unquoted.cmake", it would be
          // "string.unquoted" and "string"
          const scopeNameComponents = name.split(".")
          let componentLength = scopeNameComponents.length - 1

          let i = 0
          let maxIterationCount = 1000

          while (componentLength > 0) {
            i += 1
            if (i > maxIterationCount) throw new Error("Max iterations exceeded")

            const simplifiedScopeName = scopeNameComponents.slice(0, componentLength).join(".")

            allScopeNamesKeyed[simplifiedScopeName] = true
            componentLength -= 1
          }
        })
      }
    })
  })

  const allScopeNames = Object.keys(allScopeNamesKeyed)

  const allThemeNames = Object.keys(bundledThemes)

  // Allows you to feed in a scope and get a color back on the other side
  const debuggingGrammar = {
    scopeName: "source.debug-scopes",
    name: "debugging-grammar",
    patterns: [{ match: "\\b([a-zA-Z0-9_.]+)\\b", captures: { 1: { name: "$1" } } }],
  }
  const highlighter = await createHighlighter({ langs: [debuggingGrammar], themes: allThemeNames })

  const scopeNameToColor = ({ scopeName, themeName }) => {
    const output = highlighter.codeToTokens(scopeName, {
      lang: "debugging-grammar",
      theme: themeName,
    })

    return JSON.stringify(sortObjectKeys(omit(output.tokens[0][0], ["content", "offset"])))
  }

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
    let specificityMatters = false

    let simplifiedScopeName
    if (scopeName.includes(".")) {
      simplifiedScopeName = scopeName.split(".").slice(0, -1).join(".")
    } else {
      specificityMatters = true
    }

    const themeColors = themes.map(theme => {
      const color = scopeNameToColor({ scopeName, themeName: theme.name })

      let simplifiedScopeNameColor
      if (simplifiedScopeName) {
        simplifiedScopeNameColor = scopeNameToColor({
          scopeName: simplifiedScopeName,
          themeName: theme.name,
        })
      }
      if (simplifiedScopeNameColor !== color) specificityMatters = true

      return [theme.id, color]
    })

    if (!specificityMatters) {
      console.log("❌", scopeName)
      continue
    }

    await query(`INSERT INTO scopes (name) VALUES ('${scopeName}')`)

    const [scope] = await query(`SELECT * FROM scopes WHERE name = '${scopeName}'`)

    const themeColorsFormatted = themeColors
      .map(([themeId, color]) => `(${themeId}, ${scope.id}, '${color}')`)
      .join(", ")

    await query(`INSERT INTO colors (theme_id, scope_id, color) VALUES ${themeColorsFormatted}`)

    console.log("✅", scopeName)
  }

  await new Promise(resolve => {
    db.close(err => {
      if (err) throw err
      resolve()
    })
  })
}

const walkObjects = (value, callback) => {
  if (value === null || typeof value !== "object") return

  if (Array.isArray(value)) {
    value.forEach(item => walkObjects(item, callback))
    return
  }

  callback(value)
  Object.values(value).forEach(v => walkObjects(v, callback))
}

const sortObjectKeys = obj =>
  Object.keys(obj)
    .sort()
    .reduce((acc, key) => ({ ...acc, [key]: obj[key] }), {})

step2()
