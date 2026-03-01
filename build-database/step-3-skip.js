const sqlite3 = require("sqlite3").verbose()

const step3Skip = async () => {
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

  const scopes = await query(`
    SELECT id FROM scopes
  `)

  for (const scope of scopes) {
    await query(`UPDATE scopes SET cluster_scope_id = ${scope.id} WHERE id = ${scope.id}`)
  }
}

step3Skip()
