const { createScopeNameToColor, walkObjects } = require("./utilities")
const sqlite3 = require("sqlite3").verbose()

const step2 = async () => {
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
        return [name, themeModule.default]
      }),
    ),
  )

  const allScopeNamesKeyed = {}
  // Object.values(allGrammars).forEach(grammar => {
  //   walkObjects(grammar, object => {
  //     const isPattern = object.scopeName === undefined
  //     if (object.name && isPattern) {
  //       const isValidName = typeof object.name === "string"
  //       if (!isValidName) return

  //       // These mandate specific formatting (e.g. markup.underline, markup.italic) and clash with
  //       // the whole concept of semantic tokens
  //       if (object.name.includes("markup")) return

  //       // Handle spaces, which can be used to apply multiple names to one token
  //       let names
  //       if (object.name.includes(" ")) {
  //         names = [object.name, ...object.name.split(" ")]
  //       } else {
  //         names = [object.name]
  //       }

  //       names.forEach(name => {
  //         allScopeNamesKeyed[name] = true
  //         if (object.name.includes(" ")) return

  //         // Make sure to include the parent scopes, so for "string.unquoted.cmake", it would be
  //         // "string.unquoted" and "string"
  //         const scopeNameComponents = name.split(".")
  //         let componentLength = scopeNameComponents.length - 1

  //         let i = 0
  //         let maxIterationCount = 1000

  //         while (componentLength > 0) {
  //           i += 1
  //           if (i > maxIterationCount) throw new Error("Max iterations exceeded")

  //           const simplifiedScopeName = scopeNameComponents.slice(0, componentLength).join(".")

  //           allScopeNamesKeyed[simplifiedScopeName] = true
  //           componentLength -= 1
  //         }
  //       })
  //     }
  //   })
  // })

  Object.values(allThemes).forEach(theme => {
    theme.tokenColors.forEach(tokenColorSet => {
      if (!tokenColorSet?.settings?.foreground) {
        // One feature Textmate Grammars support is "falling through" - basically it's possible to
        // decouple the font style, background color and text color across different selectors.
        // I haven't figured out a way to replicate this, so I decided to discard settings that omit
        // a text color, basically it's better to get the color right than the font style
        return
      }

      if (tokenColorSet?.scope?.includes(">")) {
        return // TODO: I think I should be able to support this
      }

      if (typeof tokenColorSet?.scope === "string" && tokenColorSet.scope.startsWith(" ")) {
        return // invalid
      }

      const allScopes = []
      if (tokenColorSet.scope) {
        if (Array.isArray(tokenColorSet.scope)) {
          allScopes.push(...tokenColorSet.scope)
        } else if (tokenColorSet.scope.includes(",")) {
          allScopes.push(...tokenColorSet.scope.split(",").map(scope => scope.trim()))
        } else {
          allScopes.push(tokenColorSet.scope)
        }
      }
      allScopes.forEach(scope => {
        allScopeNamesKeyed[scope] = true
      })
    })
  })

  allScopeNamesKeyed.default = true // Selector with no effect

  const allScopeNames = Object.keys(allScopeNamesKeyed)

  const allThemeNames = Object.keys(bundledThemes)

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
    // let specificityMatters = false

    // let simplifiedScopeName
    // if (scopeName.includes(".")) {
    //   simplifiedScopeName = scopeName.split(".").slice(0, -1).join(".")
    // } else {
    //   specificityMatters = true
    // }

    const themeColors = themes.map(theme => {
      const color = scopeNameToColor({ scopeName, themeName: theme.name })

      // let simplifiedScopeNameColor
      // if (simplifiedScopeName) {
      //   simplifiedScopeNameColor = scopeNameToColor({
      //     scopeName: simplifiedScopeName,
      //     themeName: theme.name,
      //   })
      // }
      // if (simplifiedScopeNameColor !== color) specificityMatters = true

      return [theme.id, color]
    })

    // if (!specificityMatters) {
    //   console.log("❌", scopeName)
    //   continue
    // }

    await query(`INSERT INTO scopes (name) VALUES ('${scopeName}')`)

    const [scope] = await query(`SELECT * FROM scopes WHERE name = '${scopeName}'`)

    const themeColorsFormatted = themeColors
      .map(([themeId, color]) => `(${themeId}, ${scope.id}, '${color}')`)
      .join(", ")

    await query(`INSERT INTO colors (theme_id, scope_id, color) VALUES ${themeColorsFormatted}`)

    // console.log("✅", scopeName)
  }

  await new Promise(resolve => {
    db.close(err => {
      if (err) throw err
      resolve()
    })
  })
}

step2()
