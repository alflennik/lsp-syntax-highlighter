const mapSectionIndexesToDocumentIndexes = sections => {
  const sectionOffsetLists = {}

  const getDocumentIndexes = (sectionIndex, sectionLineIndex, sectionColumnIndex) => {
    const offsetsList = sectionOffsetLists[sectionIndex]
    const offsets = (() => {
      const lastOffsets = offsetsList.at(-1)

      const isEndContextString =
        lastOffsets.endSectionLineIndex < sectionLineIndex ||
        (lastOffsets.endSectionLineIndex === sectionLineIndex &&
          lastOffsets.endSectionColumnIndex < sectionColumnIndex)

      const isStartContextString =
        offsetsList[0].startSectionLineIndex > sectionLineIndex ||
        (offsetsList[0].startSectionLineIndex === sectionLineIndex &&
          offsetsList[0].startSectionColumnIndex > sectionColumnIndex)

      if (isEndContextString || isStartContextString) return

      for (let i = 0; i < offsetsList.length; i += 1) {
        const offsets = offsetsList[i]
        if (
          (sectionLineIndex > offsets.startSectionLineIndex ||
            (sectionLineIndex === offsets.startSectionLineIndex &&
              sectionColumnIndex >= offsets.startSectionColumnIndex)) &&
          (sectionLineIndex < offsets.endSectionLineIndex ||
            (sectionLineIndex === offsets.endSectionLineIndex &&
              sectionColumnIndex < offsets.endSectionColumnIndex))
        ) {
          return offsets
        }
      }
    })()

    if (!offsets) return null // startContextString or endContextString

    return [
      sectionLineIndex + offsets.lineOffset,
      sectionLineIndex === offsets.startSectionLineIndex
        ? sectionColumnIndex + offsets.startColumnOffset
        : sectionColumnIndex,
    ]
  }

  sections.forEach((section, sectionIndex) => {
    const startContextString = section.startContextString ?? ""

    const startContextStringNewlineCount = startContextString
      .split("")
      .filter(character => character === "\n").length

    const startContextStringEndLength = (() => {
      const lastNewlineIndex = startContextString.lastIndexOf("\n")
      return lastNewlineIndex !== -1
        ? startContextString.length - lastNewlineIndex - 1 // 1 for newline
        : startContextString.length
    })()

    let currentLineOffset = section.startLineIndex - startContextStringNewlineCount
    let currentColumnOffset = startContextStringNewlineCount
      ? startContextStringEndLength
      : section.startColumnIndex - startContextStringEndLength

    const offsetList = []

    ;(() => {
      const firstSkippedSection = section.skippedSections?.[0]

      const endLineIndex = firstSkippedSection
        ? firstSkippedSection.startLineIndex
        : section.endLineIndex

      const endColumnIndex = firstSkippedSection
        ? firstSkippedSection.startColumnIndex
        : section.endColumnIndex

      const startSectionLineIndex = startContextStringNewlineCount
      const startSectionColumnIndex = startContextStringEndLength
      const endSectionLineIndex = endLineIndex - currentLineOffset
      const endSectionColumnIndex = startContextStringNewlineCount
        ? startContextStringEndLength
        : endColumnIndex - currentColumnOffset

      const sectionHasLength =
        startSectionLineIndex !== endSectionLineIndex ||
        startSectionColumnIndex !== endSectionColumnIndex

      if (sectionHasLength) {
        offsetList.push({
          startSectionLineIndex,
          startSectionColumnIndex,
          endSectionLineIndex,
          endSectionColumnIndex,
          lineOffset: currentLineOffset,
          startColumnOffset: currentColumnOffset,
        })
      }
    })()

    section.skippedSections?.forEach((skippedSection, skippedSectionIndex) => {
      if (skippedSectionIndex === 1) {
        console.log()
      }
      const nextSkippedSection = section.skippedSections?.[skippedSectionIndex + 1]

      let hasGap
      if (nextSkippedSection) {
        hasGap =
          skippedSection.endLineIndex < nextSkippedSection.startLineIndex ||
          (skippedSection.endLineIndex === nextSkippedSection.startLineIndex &&
            skippedSection.endColumnIndex < nextSkippedSection.startColumnIndex)
      } else {
        hasGap =
          skippedSection.endLineIndex < section.endLineIndex ||
          (skippedSection.endLineIndex === section.endLineIndex &&
            skippedSection.endColumnIndex < section.endColumnIndex)
      }

      let unskippedSection
      if (hasGap) {
        if (nextSkippedSection) {
          unskippedSection = {
            startLineIndex: skippedSection.endLineIndex,
            startColumnIndex: skippedSection.endColumnIndex,
            endLineIndex: nextSkippedSection.startLineIndex,
            endColumnIndex: nextSkippedSection.startColumnIndex,
          }
        } else {
          unskippedSection = {
            startLineIndex: skippedSection.endLineIndex,
            startColumnIndex: skippedSection.endColumnIndex,
            endLineIndex: section.endLineIndex,
            endColumnIndex: section.endColumnIndex,
          }
        }
      }

      const replacement = skippedSection.replacement ?? ""

      const replacementNewlineCount = replacement
        .split("")
        .filter(character => character === "\n").length

      const replacementEndLength = (() => {
        const lastNewlineIndex = replacement.lastIndexOf("\n")
        return lastNewlineIndex !== -1
          ? replacement.length - lastNewlineIndex - 1
          : replacement.length
      })()

      currentLineOffset +=
        skippedSection.endLineIndex - skippedSection.startLineIndex - replacementNewlineCount

      currentColumnOffset =
        skippedSection.startLineIndex === skippedSection.endLineIndex
          ? skippedSection.endColumnIndex
          : skippedSection.endColumnIndex - skippedSection.startColumnIndex - replacementEndLength

      if (unskippedSection) {
        const startSectionLineIndex = unskippedSection.startLineIndex - currentLineOffset

        const startSectionColumnIndex =
          skippedSection.startLineIndex === skippedSection.endLineIndex
            ? unskippedSection.startColumnIndex - currentColumnOffset
            : unskippedSection.startColumnIndex - currentColumnOffset
        // ? unskippedSection.startColumnIndex

        const endLineIndex = nextSkippedSection
          ? nextSkippedSection.startLineIndex
          : section.endLineIndex

        const endColumnIndex = nextSkippedSection
          ? nextSkippedSection.startColumnIndex
          : section.endColumnIndex

        const endSectionLineIndex = endLineIndex - currentLineOffset - replacementNewlineCount
        const endSectionColumnIndex =
          endLineIndex === currentLineOffset ? endColumnIndex - currentColumnOffset : endColumnIndex

        offsetList.push({
          startSectionLineIndex,
          startSectionColumnIndex,
          endSectionLineIndex,
          endSectionColumnIndex,
          lineOffset: currentLineOffset,
          startColumnOffset: currentColumnOffset,
        })
      }
    })

    sectionOffsetLists[sectionIndex] = offsetList
  })

  return { getDocumentIndexes }
}

module.exports = mapSectionIndexesToDocumentIndexes
