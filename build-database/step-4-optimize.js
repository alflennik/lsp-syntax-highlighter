const sqlite3 = require("sqlite3").verbose()

const step4 = async () => {
  const scopes = await query(`
    SELECT s1.*, s2.name AS cluster_scope_name
    FROM scopes s1
      INNER JOIN scopes s2 ON s1.cluster_scope_id = s2.id
  `)
  console.log(scopes)
  console.log()
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
