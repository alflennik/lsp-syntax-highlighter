# LSP Syntax Highlighter

Add syntax highlighting to your language server, officially compatible with VSCode and Cursor.

Note that the languages grammars you support must be packaged into your extension and cannot be dynamically loaded. Due to VSCode's architecture (not a limitation caused by this library) users will experience poor performance if you include too many languages in your extension (works best with less than 15-20 grammars). 

Also note that some grammars work better than others. In my opinion around 50% are close to perfect, 20% are usuable and 30% are unusable. To see your grammar in action, clone the repo for this package at https://github.com/alflennik/lsp-syntax-highlighter/ and follow the instuctions in the demo folder spin up the demo which shows the results you can expect for the languages that are important to you.

## Usage

```js
const highlighter = require('lsp-syntax-highlighter')

const mySemanticTokenHandler = async (textDocument) => {
  const { encodedTokens, tokens } = await highlighter.highlight({ 
    text: textDocument,
    sections: [
      { startOffset: 21, endOffset: 68, grammar: 'json' },
      { 
        startOffset: 87,
        endOffset: 156,
        grammar: 'css',
        replacements: [
          { startOffset: 87, endOffset: 87, text: "style {" }
          { startOffset: 156, endOffset: 156, text: "}" }
        ]
      },
      { 
        startOffset: 170,
        endOffset: 349,
        grammar: 'html',
        replacements: [
          { startOffset: 191, endOffset: 310, text: '""' }
        ]
      },
      {
        startOffset: 211,
        endOffset: 310,
        grammar: 'css',
        replacements: [
          { startOffset: 211, endOffset: 211, text: 'style {' }
          { startOffset: 310, endOffset: 310, text: '}' }
        ]
      }
    ]
  })

  console.log(tokens)

  return { data: encodedTokens }
}
```

## Installation Guide

You will need a working LSP implementation integrated with VSCode or Cursor. There are some samples provided by VSCode, and I can recommend https://github.com/semanticart/lsp-from-scratch/.

Install this package:

```
npm install lsp-syntax-highlighter
```

Run the compile command, which looks like this:

```
npx lsp-syntax-highlighter-compiler \
  --package-json=./package.json \
  --grammar=html \
  --grammar=css \
  --grammar=javascript \
  --custom-grammar=./grammars/my-language.json \
  --database-file=./grammars/lsp-syntax-highlighter.json
```

- `--package-json=./package.json`: Required. Indicates the path to the package.json for your Vscode extension's package.json, relative to your current working directory. This will add the following required fields to the contributes section. (It will not overwrite any other fields.)
  ```json
  "contributes": {
    "configurationDefaults": { "editor.semanticHighlighting.enabled": true },
    "semanticTokenScopes": [{ "scopes": 
      {"color0":["default"], "color1": /* ... very long list which is dependent on the grammars you have enabled ... */ }
    }]
  },
  ```
- `--grammar=html`, `--grammar=css`, `--grammar=javascript`: Grammars you want to support. You can use any grammars which appear in the list here: https://github.com/alflennik/lsp-syntax-highlighter/tree/main/compiler/analysis The name you provide should match the json file, so if the grammar file is called `html.json` the command should be `--grammar=html`. Thanks to the Shiki library for collating all these commonly used grammars.

  For nested languages to work, ensure that you also include their grammars as well, for example HTML requires CSS and JS grammars since it can contain those languages inside style and script tags.

  Users will experience poor performance if you include too many languages in your extension (works best with less than 15-20 grammars).

  At least one grammar or custom grammar is required.

- `--custom-grammar=./grammars/my-language.json`: You can add any number of custom grammars in JSON format, which will behave exactly the same as the `--grammar` grammars. Paths are relative to your current working directory. Be aware that each custom grammar you provide can add a significant amount of processing time to this command, sometimes even an hour, or more.

  At least one grammar or custom grammar is required.

- `--database-file=./grammars/lsp-syntax-highlighter.json`: The JSON file where you want the compiler to output its generated database file, relative to your current working directory. It must end in `.json`. You can gitignore this file if you want.

After running the command, you need to add some configuration to your LSP.

You need to call `highlighter.load()` with the path pointing to the same grammar database which was created with the `--database-file` command above.

```js
const path = require('path')
const highlighter = require('lsp-syntax-highlighter')

const databasePath = path.resolve(__dirname, "./grammars/lsp-syntax-highlighter.json")
highlighter.load(databasePath)
```

The `.load` call needs to happen before any other highlighter functions can be used.

In your LSP, you need to return the following for the 'initialization' request:

```js
const highlighter = require('lsp-syntax-highlighter')

const initializeHandler = async () => {
  return {
    // ...
    capabilities: {
      // ...
      ...highlighter.getCapabilities(),
    },
  };
}
```

The exact format of the initializeHandler function will depend on your language server implementation. For reference or if you're curious, the capabilities returned look like the following:

```js
{
  semanticTokensProvider: {
    legend: {
      tokenTypes: ['color0', 'color1', 'color2', /* ... very long list */],
      tokenModifiers: [],
    },
    full: true,
  },
}
```

Add a handler for `textDocument/semanticTokens/full`:

```js
const highlighter = require('lsp-syntax-highlighter')

const mySemanticTokenHandler = async (textDocument) => {
  const { encodedTokens, tokens } = await highlighter.highlight({ 
    text: textDocument,
    sections: [
      { 
        startOffset: 170,
        endOffset: 349,
        grammar: 'html',
        replacements: [
          { startOffset: 191, endOffset: 310, text: '""' }
        ]
      },
    ]
  })

  console.log(tokens)

  return { data: encodedTokens }
}
```

The exact format of the handler function will depend on your language server implementation.

## API Documentation

### The `load` and `getCapabilities` Functions

```js
// Setup function that needs to be called before any other methods
highlighter.load(
  // A file path pointing to the compiled grammar database you generated during setup. It's 
  // recommended to use path.resolve() to get an absolute path (to avoid cwd issues)
  databasePath
)

// An object with capabilities that you must return in your LSP's initialization response
const capabilities = 
  highlighter.getCapabilities()
```

### The `highlight` Function
The highlight function uses the same grammar tokenizer built into VSCode, and then highlights the text using the pregenerated database you created during the installation steps.

```js
const { 
  // The series of numbers required by the LSP standard
  encodedTokens, 
  // A human-readable list of tokens useful for debugging
  tokens, 
} = await highlighter.highlight({
  // The full text of the document you are highlighting
  text, 
  // The main highlighting config, described below
  sections, 
})
```

### The `sections` Array

```js
const sections = [{
  // A number referring to an index on the text document being highlighted
  startOffset, 
  // The end number
  endOffset, 
  // The grammar name (matches the name used when the database was compiled, e.g. "html" in 
  // "--grammar=html")
  grammar, 
  replacements: [
    // An array of alterations that you want to make to the text before sending it to the
    // highlighter. Useful for priming the grammar into a specific state or removing string
    // replacements like `my string with an ${insertion}` in JavaScript.
    { 
      startOffset: replacementStart, // An index number which needs to be within the text document
      // The end number. Can be the same as the startOffset in the case that you want to add text 
      // without removing any.
      endOffset: replacementEnd, 
      // Text to insert within the offsets. Can be an empty string if you simply want to remove 
      // text.
      text: replacementText, 
    }
  ]
}]
```
