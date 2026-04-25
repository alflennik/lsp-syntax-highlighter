const fs = require("fs/promises")
const path = require("path")
const { spawn } = require("child_process")

const setup = async () => {
  console.info("Setting up compiled grammar database ...")

  const packageJsonPath = path.resolve(__dirname, "../package.json")
  const databasePath = path.resolve(__dirname, "../database.json")
  const analysisPath = path.resolve(__dirname, "../../compiler/analysis")

  // Package JSON is required but in this case isn't needed and will be deleted at end
  const packageJson = { name: "mock-package-json" }
  await fs.writeFile(packageJsonPath, JSON.stringify(packageJson), { encoding: "utf-8" })

  const analysisFiles = await fs.readdir(analysisPath)
  const analysisGrammarNames = analysisFiles.map(fileName => fileName.slice(0, -5) /* .json */)

  await new Promise((resolve, reject) => {
    const nodeCommandPath = process.execPath
    const compilerPath = path.resolve(__dirname, "../../compiler/index.js")

    const grammarsArgs = analysisGrammarNames.map(grammarName => `--grammar=${grammarName}`)

    const compilationProcess = spawn(
      nodeCommandPath,
      [
        compilerPath,
        `--package-json=${packageJsonPath}`,
        ...grammarsArgs,
        `--database-file=${databasePath}`,
      ],
      { stdio: "inherit", env: { LOCAL_PACKAGES: "true" } },
    )

    compilationProcess.on("exit", (code, signal) => {
      if (code === 0) return resolve()
      reject()
    })
  }).finally(async () => {
    await fs.rm(packageJsonPath)
  })
}

module.exports = setup
