const fs = require("fs/promises")
const path = require("path")
const compilerPackageJson = require("../package.json")
const analyze = require("./analyze")

const compile = async () => {
  const { bundledLanguages, bundledThemes } = await import("shiki")

  let packageJsonPath
  let databaseFilePath
  const grammarNames = []
  const customGrammarPaths = []

  if (process.argv[2] === "--version") {
    console.info(compilerPackageJson.version)
    return
  }

  process.argv.slice(2).forEach(argv => {
    const packageJsonMatch = argv.match(/--package-json=(.+)/)
    if (packageJsonMatch) {
      packageJsonPath = packageJsonMatch[1]
      return
    }

    const grammarMatch = argv.match(/--grammar=(.+)/)
    if (grammarMatch) {
      grammarNames.push(grammarMatch[1])
      return
    }

    const customGrammarMatch = argv.match(/--custom-grammar=(.+)/)
    if (customGrammarMatch) {
      customGrammarPaths.push(customGrammarMatch[1])
      return
    }

    const databaseFileMatch = argv.match(/--database-file=(.+)/)
    if (databaseFileMatch) {
      databaseFilePath = databaseFileMatch[1]
      return
    }

    throw new Error(`Unrecognized argument "${argv}"`)
  })

  // It's important to raise any errors that can occur early because it would be tragic if the user
  // waited a whole hour to process a custom gramamr before hitting a basic "path doesn't exist"
  // kind of error.

  if (!packageJsonPath) {
    throw new Error(
      "No package.json path was provided with the `--package-json=./package.json` option",
    )
  }

  const packageJsonFullPath = path.resolve(process.cwd(), packageJsonPath)

  await (async () => {
    if (!packageJsonPath.match(/\bpackage\.json$/)) {
      throw new Error("The package.json file must be named package.json")
    }
    try {
      const packageJsonResponse = await fs.readFile(packageJsonFullPath, { encoding: "utf-8" })
      const packageJson = JSON.parse(packageJsonResponse)
      if (!packageJson?.name) throw new Error("Malformed package.json")
    } catch (error) {
      console.error(error)
      throw new Error(`Failed to load package.json at the path "${packageJsonFullPath}"`)
    }
  })()

  if (!databaseFilePath) {
    throw new Error(
      "No database file path was provided with the `--database-file=./my-path.json` option",
    )
  }

  if (!databaseFilePath.endsWith(".json")) {
    throw new Error("File path must end with .json for the `--database-file=./my-path.json` option")
  }

  const databaseFileFullPath = path.resolve(process.cwd(), databaseFilePath)

  await (async () => {
    let databaseDirectoryExists
    try {
      await fs.access(path.dirname(databaseFileFullPath))
      databaseDirectoryExists = true
    } catch (error) {
      databaseDirectoryExists = false
    }

    if (!databaseDirectoryExists) {
      throw new Error(
        `Cannot write database file into a directory that does not exist: ` +
          `"${path.dirname(databaseFileFullPath)}"`,
      )
    }
  })()

  if (!(grammarNames.length || customGrammarPaths.length)) {
    throw new Error(
      "At least one grammar or custom grammar must be specified with `--grammar=html` or " +
        "`--custom-grammar=./my-path.json` option",
    )
  }

  const analysisFileNames = await fs.readdir(path.resolve(__dirname, "../analysis"))

  grammarNames.forEach(grammarName => {
    if (!analysisFileNames.includes(`${grammarName}.json`)) {
      throw new Error(
        `No data found for the "${grammarName}" grammar provided with the --grammar option. ` +
          `Please ensure a json file is present (with the same name) in the directory here: ` +
          `https://github.com/alflennik/lsp-syntax-highlighter/tree/main/compiler/database\n\n` +
          `If your intended grammar is missing you can still add it with the ` +
          `--custom-grammar=./my-grammar.json option.`,
      )
    }
  })

  const customGrammars = []

  for (const customGrammarPath of customGrammarPaths) {
    const fullPath = path.resolve(process.cwd(), customGrammarPath)

    try {
      const customGrammarResponse = await fs.readFile(fullPath, { encoding: "utf-8" })
      const customGrammar = JSON.parse(customGrammarResponse)
      if (!customGrammar?.name) throw new Error("Malformed custom grammar")

      customGrammars.push(customGrammar)
    } catch (error) {
      console.error(error)
      throw new Error(`Failed to load custom grammar at the path "${fullPath}"`)
    }
  }

  const database = { grammars: {}, analysis: {} }

  for (const grammarName of grammarNames) {
    database.grammars[grammarName] = await (async () => {
      const importer = bundledLanguages[grammarName]
      const imported = await importer()
      return imported.default.at(-1) // Dependent languages will be listed first
    })()
    database.analysis[grammarName] = require(`../analysis/${grammarName}.json`)
  }

  if (customGrammars.length) {
    const themes = await Object.fromEntries(
      await Promise.all(
        Object.entries(bundledThemes).map(async ([name, importer]) => {
          const themeModule = await importer()
          return [name, themeModule.default]
        }),
      ),
    )

    for (const customGrammar of customGrammars) {
      const analysis = await analyze({ grammar: customGrammar, themes })

      database.grammars[customGrammar.name] = customGrammar
      database.analysis[customGrammar.name] = analysis
    }
  }

  const semanticTokens = { color0: ["default"] }

  let colorNumber = 1

  Object.entries(database.analysis).forEach(([grammarName, analysis]) => {
    analysis.scopeData.splice(0, 0, { scopeName: "default", rank: 0, semanticToken: "color0" })

    for (let i = 1; i < analysis.scopeData.length; i += 1) {
      const color = `color${colorNumber}`
      const scopeName = `${analysis.grammarScopeName} ${analysis.scopeData[i].scopeName}`

      analysis.scopeData[i].semanticToken = color
      semanticTokens[color] = [scopeName]

      colorNumber += 1
    }
  })

  database.colorCount = colorNumber

  await fs.writeFile(databaseFileFullPath, JSON.stringify(database), { encoding: "utf-8" })

  await (async () => {
    const packageJsonText = await fs.readFile(packageJsonFullPath, { encoding: "utf-8" })
    const indentation = packageJsonText.match(/\n?([ \t]*)"name"/)?.[1] ?? "  "

    const packageJson = JSON.parse(packageJsonText)

    const contributes = {
      ...packageJson.contributes,
      configurationDefaults: {
        ...packageJson.contributes?.configurationDefaults,
        "editor.semanticHighlighting.enabled": true,
      },
      semanticTokenScopes: [],
    }

    let insertion = JSON.stringify(contributes, null, indentation)

    insertion = insertion.replace(/\n/g, `\n${indentation}`)

    // It's awkward but it's much better to let the list run off the right instead of making the
    // package.json 10K+ lines long or whatever
    insertion = insertion.replace(
      "[]",
      `[{ "scopes":\n` +
        `${indentation}${indentation}${indentation}${JSON.stringify(semanticTokens)}\n` +
        `${indentation}${indentation}}]`,
    )

    if (!packageJson.contributes) {
      insertion = `,\n${indentation}"contributes": ${insertion}`
    }

    const keyAfterContributes = (() => {
      let previousWasContributes = false
      for (const key of Object.keys(packageJson)) {
        if (key === "contributes") {
          previousWasContributes = true
          continue
        }
        if (previousWasContributes) return key
      }
    })()

    let insertionStartIndex
    let insertionEndIndex
    if (packageJson.contributes) {
      const contributesMatch = packageJsonText.match(/[^\\]"contributes"\s*:\s*/)
      insertionStartIndex = contributesMatch.index + contributesMatch[0].length

      if (keyAfterContributes) {
        const keyAfterContributesMatch = packageJsonText.match(
          `(?<=}\\s*),\\s*"${keyAfterContributes}"\\s*:\\s*`,
        )
        insertionEndIndex = keyAfterContributesMatch.index
      } else {
        const lastLineMatch = packageJsonText.match(/\n?\s*}\s*$/)
        insertionEndIndex = lastLineMatch.index
      }
    } else {
      const lastLineMatch = packageJsonText.match(/\n?\s*}\s*$/)

      insertionStartIndex = lastLineMatch.index
      insertionEndIndex = lastLineMatch.index
    }

    const newPackageJson =
      packageJsonText.slice(0, insertionStartIndex) +
      insertion +
      packageJsonText.slice(insertionEndIndex)

    await fs.writeFile(packageJsonFullPath, newPackageJson, { encoding: "utf-8" })
  })()

  console.info("Succeeded.")
}

module.exports = compile
