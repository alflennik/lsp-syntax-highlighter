const sqlite3 = require("sqlite3").verbose()
const path = require("path")
const fs = require("fs/promises")

const step4 = async () => {
  const scopes = await query(`
    SELECT s1.*, s2.name AS cluster_scope_name
    FROM scopes s1
      INNER JOIN scopes s2 ON s1.cluster_scope_id = s2.id
  `)

  let newWellKnownScopes = []
  let database = {}
  scopes.forEach(scope => {
    database[scope.name] = scope.cluster_scope_name

    if (
      !Object.values(wellKnownMappings).includes(scope.cluster_scope_name) &&
      !newWellKnownScopes.find(each => each.id === scope.cluster_scope_id)
    ) {
      newWellKnownScopes.push({ id: scope.cluster_scope_id, name: scope.cluster_scope_name })
    }
  })

  database = Object.fromEntries(
    Object.entries(database).sort((a, b) => {
      return a[0].localeCompare(b[0])
    }),
  )

  console.log(newWellKnownScopes.map(each => each.name).join("\n"))

  const newWellKnownMappings = Object.fromEntries(
    newWellKnownScopes.map((scope, index) => {
      return [`untitled${index + 1}`, scope.name]
    }),
  )

  await fs.writeFile(
    path.resolve(__dirname, "../database.json"),
    JSON.stringify(database, null, 2),
    { encoding: "utf8" },
  )

  await fs.writeFile(
    path.resolve(__dirname, "../semanticTokens.json"),
    JSON.stringify({ ...wellKnownMappings, ...newWellKnownMappings }, null, 2),
    { encoding: "utf8" },
  )
}

const wellKnownMappings = {
  namespace: "entity.name.namespace",
  type: "entity.name.type",
  "type.defaultLibrary": "support.type",
  struct: "storage.type.struct",
  class: "entity.name.type.class",
  "class.defaultLibrary": "support.class",
  interface: "entity.name.type.interface",
  enum: "entity.name.type.enum",
  function: "entity.name.function",
  "function.defaultLibrary": "support.function",
  method: "entity.name.function.member",
  macro: "entity.name.function.preprocessor",
  variable: "entity.name.variable",
  "variable.readonly": "variable.other.constant",
  "variable.readonly.defaultLibrary": "support.constant",
  parameter: "variable.parameter",
  property: "variable.other.property",
  "property.readonly": "variable.other.constant.property",
  enumMember: "variable.other.enummember",
  event: "variable.other.event",
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
