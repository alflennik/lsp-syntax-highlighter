const sqlite3 = require("sqlite3").verbose()
const path = require("path")
const fs = require("fs/promises")

const requiredScopeNamesFromManualTesting = ["entity.other.attribute-name.html", "string"]

const step4 = async () => {
  const scopes = await query(`
    SELECT s1.*, s2.name AS cluster_scope_name
    FROM scopes s1
      INNER JOIN scopes s2 ON s1.cluster_scope_id = s2.id
  `)

  let selectedScopes = []
  let database = {}
  scopes.forEach(scope => {
    database[scope.name] = scope.cluster_scope_name

    if (!selectedScopes.find(eachName => eachName === scope.cluster_scope_name)) {
      selectedScopes.push(scope.cluster_scope_name)
    }
  })

  requiredScopeNamesFromManualTesting.forEach(requiredScopeName => {
    database[requiredScopeName] = requiredScopeName

    if (!selectedScopes.includes(requiredScopeName)) {
      selectedScopes.push(requiredScopeName)
    }
  })

  selectedScopes.sort((a, b) => a.localeCompare(b))

  database = Object.fromEntries(
    Object.entries(database).sort((a, b) => {
      return a[0].localeCompare(b[0])
    }),
  )

  const semanticTokenMappings = Object.fromEntries(
    selectedScopes.map((scopeName, index) => {
      return [`color${index + 1}.version1`, scopeName]
    }),
  )

  await fs.writeFile(
    path.resolve(__dirname, "../database.json"),
    JSON.stringify(database, null, 2),
    { encoding: "utf8" },
  )

  await fs.writeFile(
    path.resolve(__dirname, "../semanticTokens.json"),
    JSON.stringify(semanticTokenMappings, null, 2),
    { encoding: "utf8" },
  )
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

step4()
