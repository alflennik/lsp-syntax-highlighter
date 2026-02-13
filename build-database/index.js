const buildDatabase = async () => {
  const { createHighlighter, bundledLanguages, bundledThemes } =
    await import("shiki");

  const allGrammars = await Object.fromEntries(
    await Promise.all(
      Object.entries(bundledLanguages).map(async ([name, importer]) => {
        const imported = await importer();
        const grammar = imported.default.at(-1); // Dependent languages will be listed first
        return [grammar.scopeName, grammar];
      }),
    ),
  );

  const allRuleNamesKeyed = {};
  Object.values(allGrammars).forEach((grammar) => {
    walkObjects(grammar, (object) => {
      const isPattern = object.scopeName === undefined;
      if (object.name && isPattern) {
        const isValidName = typeof object.name === "string";
        if (!isValidName) return;

        // Handle spaces, which can be used to apply multiple names to one token
        const names = object.name.split(" ");

        names.forEach((name) => {
          allRuleNamesKeyed[name] = true;

          // Make sure to include the parent scopes, so for "string.unquoted.cmake", it would be
          // "string.unquoted" and "string"
          const ruleNameComponents = name.split(".");
          let componentLength = ruleNameComponents.length - 1;

          let i = 0;
          let maxIterationCount = 1000;

          while (componentLength > 0) {
            i += 1;
            if (i > maxIterationCount)
              throw new Error("Max iterations exceeded");

            const simplifiedRuleName = ruleNameComponents
              .slice(0, componentLength)
              .join(".");

            allRuleNamesKeyed[simplifiedRuleName] = true;
            componentLength -= 1;
          }
        });
      }
    });
  });

  const allRuleNames = Object.keys(allRuleNamesKeyed);
  // TEMP
  // const allRuleNames = Object.keys(allRuleNamesKeyed).slice(0, 10000);

  // Allows you to feed in a scope and get a color back on the other side
  const debuggingGrammar = {
    scopeName: "source.debug-scopes",
    name: "debugging-grammar",
    patterns: allRuleNames.map((ruleName) => ({
      match:
        "^" +
        ruleName
          .split((character) => {
            if (character === ".") return "\\.";
            return character;
          })
          .join("") +
        "$",
      name: ruleName,
    })),
  };

  // const allThemeNames = Object.keys(bundledThemes);
  // const allThemeNames = ["dark-plus", "dracula", "github-dark", "one-dark-pro"];
  const allThemeNames = ["one-dark-pro"];

  const highlighter = await createHighlighter({
    langs: [debuggingGrammar],
    themes: allThemeNames,
  });

  let ruleNameToColorCache = {};
  const ruleNameToColor = ({ ruleName, themeName }) => {
    if (ruleName === "entity.name.tag") {
      console.log();
    }
    if (ruleNameToColorCache[`${ruleName}${themeName}`]) {
      return ruleNameToColorCache[`${ruleName}${themeName}`];
    }
    const output = highlighter.codeToTokens(ruleName, {
      lang: "debugging-grammar",
      theme: themeName,
    });

    const color = `${output.tokens[0][0].color} (${output.tokens[0][0].fontStyle})`;
    ruleNameToColorCache[`${ruleName}${themeName}`] = color;
    return color;
  };

  // Sourced from https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide
  const standardConversions = {
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

    // Expanded list
    comment: "comment",
    string: "string",
    operator: "keyword.operator",
    keyword: "keyword.control",
    customConstant: "constant",
    customConstantNumeric: "constant.numeric",
    customIllegal: "invalid.illegal",
    customEscape: "constant.character.escape",
    customRegexp: "string.regexp",
    customTagPunctuation: "punctuation.definition.tag",
    customAttributeName: "entity.other.attribute-name",
  };

  const themeSemanticTokenColors = {};
  allThemeNames.forEach((themeName) => {
    const semanticTokenToColor = {};
    Object.entries(standardConversions).forEach(([semanticToken, ruleName]) => {
      semanticTokenToColor[semanticToken] = ruleNameToColor({
        ruleName,
        themeName,
      });
    });
    themeSemanticTokenColors[themeName] = semanticTokenToColor;
  });

  // Remove rules that have no special meaning, i.e. entity.name.function.js could be written just
  // entity.name.function
  const minimalRuleNamesKeyed = {};
  allRuleNames.forEach((ruleName, index) => {
    if (index % 100 === 0) {
      console.log(`${index} of ${allRuleNames.length}`);
    }
    const colorByTheme = Object.fromEntries(
      allThemeNames.map((themeName) => {
        return [themeName, ruleNameToColor({ ruleName, themeName })];
      }),
    );

    const ruleNameComponents = ruleName.split(".");
    let componentCount = ruleNameComponents.length - 1;

    let i = 0;
    let maxIterationCount = 1_000_000;

    let simplestRuleName = ruleName;

    while (componentCount > 0) {
      i += 1;
      if (i > maxIterationCount) throw new Error("Max iterations exceeded");

      const trialRuleName = ruleNameComponents
        .slice(0, componentCount)
        .join(".");

      let componentMatters = false;
      allThemeNames.forEach((themeName) => {
        const correctColor = colorByTheme[themeName];
        const trialColor = ruleNameToColor({
          ruleName: trialRuleName,
          themeName,
        });

        if (correctColor !== trialColor) {
          componentMatters = true;
        }
      });

      if (componentMatters) {
        minimalRuleNamesKeyed[simplestRuleName] = true;
        break;
      }

      simplestRuleName = trialRuleName;
      componentCount -= 1;

      if (componentCount === 0) {
        minimalRuleNamesKeyed[simplestRuleName] = true;
        break;
      }
    }
  });

  const minimalRuleNames = Object.keys(minimalRuleNamesKeyed);

  const ruleNameToSemanticToken = {};
  const failures = [];

  minimalRuleNames.forEach((ruleName) => {
    const semanticTokenMatchCounts = {};

    allThemeNames.forEach((themeName) => {
      const semanticTokenColors = themeSemanticTokenColors[themeName];
      const color = ruleNameToColor({ ruleName, themeName });
      Object.entries(semanticTokenColors).map(
        ([semanticToken, semanticTokenColor]) => {
          if (color === semanticTokenColor) {
            if (!semanticTokenMatchCounts[semanticToken]) {
              semanticTokenMatchCounts[semanticToken] = 0;
            }
            semanticTokenMatchCounts[semanticToken] += 1;
          }
        },
      );
    });

    let topResult;
    for (const [semanticToken, count] of Object.entries(
      semanticTokenMatchCounts,
    )) {
      if (count === allThemeNames.length) {
        topResult = semanticToken;
        break;
      }
    }

    if (topResult) {
      ruleNameToSemanticToken[ruleName] = topResult;
    } else {
      failures.push(ruleName);
    }
  });

  console.log("success count", Object.entries(ruleNameToSemanticToken).length);
  console.log("failure count", failures.length);

  const database = Object.fromEntries(
    Object.entries(ruleNameToSemanticToken).sort((a, b) =>
      a[0].localeCompare(b[0], "en"),
    ),
  );
};

const walkObjects = (value, callback) => {
  if (value === null || typeof value !== "object") return;

  if (Array.isArray(value)) {
    value.forEach((item) => walkObjects(item, callback));
    return;
  }

  callback(value);
  Object.values(value).forEach((v) => walkObjects(v, callback));
};

buildDatabase();
