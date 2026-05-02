const http = require("http")
const initializeDemoHighlight = require("./demoHighlight")
const setup = require("./setup")

const initializeServer = async () => {
  await setup()

  const { themeNames, grammarNames, backgroundColors, demoHighlight } =
    await initializeDemoHighlight()

  const server = http.createServer(async (req, res) => {
    try {
      const { url, method } = req

      res.setHeader("Content-Type", "application/json")
      res.setHeader("Access-Control-Allow-Origin", "*")

      if (method === "GET" && url === "/metadata") {
        return res.end(JSON.stringify({ data: { themeNames, grammarNames, backgroundColors } }))
      }

      if (method === "GET" && url.startsWith("/highlight?")) {
        const queryString = url.slice(11)
        const themeName = queryString.match(/\bthemeName=([^&]+)/)?.[1]
        const grammarName = queryString.match(/\bgrammarName=([^&]+)/)?.[1]
        if (!themeName) throw new Error("themeName missing")
        if (!grammarName) throw new Error("grammarName missing")

        const data = await demoHighlight({ themeName, grammarName })
        return res.end(JSON.stringify({ data }))
      }

      res.writeHead(404)
      res.end(`{ "error": "Not found" }`)
    } catch (error) {
      console.error(error)
      res.writeHead(500)
      res.end(`{ "error": "${error.message}" }`)
    }
  })

  server.listen(1233)
  console.info("Server listening on 1233")
}

module.exports = initializeServer
