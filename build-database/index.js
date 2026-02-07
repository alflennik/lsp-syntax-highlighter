const fs = require("fs");
const path = require("path");
const vsctm = require("vscode-textmate");
const oniguruma = require("vscode-oniguruma");

const buildDatabase = async () => {
  const { bundledLanguages, bundledThemes } = await import("shiki");

  const allGrammars = await Object.fromEntries(
    await Promise.all(
      Object.entries(bundledLanguages).map(async ([name, importer]) => {
        const imported = await importer();
        const grammar = imported.default.at(-1); // Dependent languages will be listed first
        return [grammar.scopeName, grammar];
      }),
    ),
  );

  const allThemes = await Object.fromEntries(
    await Promise.all(
      Object.entries(bundledThemes).map(async ([name, importer]) => {
        const imported = await importer();
        return [name, imported.default];
      }),
    ),
  );
  // https://www.npmjs.com/package/vscode-textmate
  const wasmBin = fs.readFileSync(
    path.join(__dirname, "../node_modules/vscode-oniguruma/release/onig.wasm"),
  ).buffer;
  const vscodeOnigurumaLib = oniguruma.loadWASM(wasmBin).then(() => {
    return {
      createOnigScanner(patterns) {
        return new oniguruma.OnigScanner(patterns);
      },
      createOnigString(s) {
        return new oniguruma.OnigString(s);
      },
    };
  });

  // Create a registry that can create a grammar from a scope name.
  const registry = new vsctm.Registry({
    onigLib: vscodeOnigurumaLib,
    loadGrammar: (scopeName) => {
      if (allGrammars[scopeName]) {
        return allGrammars[scopeName];
        // return vsctm.parseRawGrammar(
        //   JSON.stringify(allGrammars[scopeName]),
        //   // Will parse as PLIST by default unless a (fake) file path is passed as the second arg
        //   // See https://github.com/microsoft/vscode-textmate/blob/main/src/parseRawGrammar.ts
        //   "./forceJson.json",
        // );
      }
      console.log(`Unknown scope name: ${scopeName}`);
      return null;
    },
  });

  // Load the JavaScript grammar and any other grammars included by it async.
  registry.loadGrammar("source.js").then((grammar) => {
    const text = [
      `function sayHello(name) {`,
      `\treturn "Hello, " + name;`,
      `}`,
    ];
    let ruleStack = vsctm.INITIAL;
    for (let i = 0; i < text.length; i++) {
      const line = text[i];
      const lineTokens = grammar.tokenizeLine(line, ruleStack);
      console.log(`\nTokenizing line: ${line}`);
      for (let j = 0; j < lineTokens.tokens.length; j++) {
        const token = lineTokens.tokens[j];
        console.log(
          ` - token from ${token.startIndex} to ${token.endIndex} ` +
            `(${line.substring(token.startIndex, token.endIndex)}) ` +
            `with scopes ${token.scopes.join(", ")}`,
        );
      }
      ruleStack = lineTokens.ruleStack;
    }
  });
};

buildDatabase();
