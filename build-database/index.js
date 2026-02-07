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
};

buildDatabase();
