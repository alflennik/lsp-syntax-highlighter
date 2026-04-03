const mapSectionIndexesToDocumentIndexes = require("./getDocumentIndexes")

describe("getDocumentIndexes", () => {
  it("accurately indexes usage example similar to readme", () => {
    const sections = [
      {
        startLineIndex: 0,
        startColumnIndex: 11,
        endLineIndex: 0,
        endColumnIndex: 75,
        grammar: "json",
      },
      {
        startLineIndex: 3,
        startColumnIndex: 33,
        endLineIndex: 7,
        endColumnIndex: 9,
        grammar: "css",
        startContextString: "style {",
        endContextString: "}",
      },
      {
        startLineIndex: 20,
        startColumnIndex: 26,
        endLineIndex: 23,
        endColumnIndex: 6,
        grammar: "html",
        skippedSections: [
          {
            startLineIndex: 21,
            startColumnIndex: 47,
            endLineIndex: 21,
            endColumnIndex: 94,
            replacement: "<head></head>",
          },
        ],
      },
      {
        startLineIndex: 21,
        startColumnIndex: 49,
        endLineIndex: 21,
        endColumnIndex: 92,
        grammar: "css",
        startContextString: "style {",
        endContextString: "}",
      },
    ]

    const { getDocumentIndexes } = mapSectionIndexesToDocumentIndexes(sections)

    expect(getDocumentIndexes(0, 0, 0)).toEqual([0, 11]) // Start of JSON
    expect(getDocumentIndexes(0, 0, 63)).toEqual([0, 74]) // End of JSON
    expect(getDocumentIndexes(0, 0, 65)).toBe(null) // 1 past the end

    /*
      Code is like this:

      3: .....33....*(font-size: 20px;
      4:  font-weight: bold;
      5:  font-style: italic;
      6:  color: #888;
      7:  --on: 1;*)

      When sent to the highlighter, it is like this:

      0: style {font-size: 20px;
      1:   font-weight: bold;
      2:   font-style: italic;
      3:   color: #888;
      4:   --on: 1;}
    */
    expect(getDocumentIndexes(1, 0, 0)).toBe(null) // Context string "style" part
    expect(getDocumentIndexes(1, 0, 1)).toBe(null) // Context string "style" part
    expect(getDocumentIndexes(1, 0, 7)).toEqual([3, 33]) // Start of css code
    expect(getDocumentIndexes(1, 1, 0)).toEqual([4, 0])
    expect(getDocumentIndexes(1, 2, 0)).toEqual([5, 0])
    expect(getDocumentIndexes(1, 3, 0)).toEqual([6, 0])
    expect(getDocumentIndexes(1, 4, 8)).toEqual([7, 8])
    expect(getDocumentIndexes(1, 4, 10)).toEqual(null) // Context string "}"

    /*
      20: .....26....*(
      21:       <div class="testing">*{messages.each(message => message.toLowerCase()}</div>
      22:       <em>Send a message today</em>
      23:       *)

      When sent to the highlighter, it is like this:

      0:
      1:        <div class="testing"><head></head></div>
      2:        <em>Send a message today</em>
      3: 
    */
    expect(getDocumentIndexes(2, 0, 0)).toEqual([20, 26])
    expect(getDocumentIndexes(2, 1, 46)).toEqual([21, 46]) // Last character before replacement
    expect(getDocumentIndexes(2, 1, 47)).toEqual(null) // Inside replacement
    expect(getDocumentIndexes(2, 1, 48)).toEqual(null) // Inside replacement
    expect(getDocumentIndexes(2, 1, 59)).toEqual(null) // Last character of replacement
    expect(getDocumentIndexes(2, 1, 60)).toEqual([21, 94]) // First character after replacement
    expect(getDocumentIndexes(2, 1, 61)).toEqual([21, 95])
    expect(getDocumentIndexes(2, 2, 0)).toEqual([22, 0])
    expect(getDocumentIndexes(2, 3, 5)).toEqual([23, 5]) // Last character
    expect(getDocumentIndexes(2, 3, 6)).toEqual(null) // After last character
  })

  it("supports multi-line context strings", () => {
    /*
      10: python.define(*(
      11:   for name in names:
      12:     print(name)
      13: )*)

      0: def myFunc():
      1:   for name in names:
      2:     print(name)
      3:
    */

    const sections = [
      {
        startLineIndex: 10,
        startColumnIndex: 16,
        endLineIndex: 13,
        endColumnIndex: 0,
        grammar: "python",
        startContextString: "def myFunc():\n  ",
      },
    ]

    const { getDocumentIndexes } = mapSectionIndexesToDocumentIndexes(sections)

    expect(getDocumentIndexes(0, 0, 0)).toEqual(null) // context string
    expect(getDocumentIndexes(0, 0, 13)).toEqual(null) // end of first line of context string
    expect(getDocumentIndexes(0, 1, 1)).toEqual(null) // last character of context string
    expect(getDocumentIndexes(0, 1, 2)).toEqual([10, 16]) // first character to highlight
  })

  it.only("supports skipped sections", () => {
    /*
      Multiple replacements:

      10: js.return(*(
      11:   const headline = *{headline}
      12:   const results = document.querySelectorAll(*{selectors.map(selector => {
      13:     log(selector.name)
      14:     return selector.name
      15:   })})
      16:   console.log(results)
      17:   return results
      18: )*)

      0: () => {
      1:   const headline = ''
      2:   const results = document.querySelectorAll('')
      3:   console.log(results)
      4:   return results
      5: }

      Starting / ending with skipped sections

      20: styling.resolve(*(*{defaultStyles} color: red;
      21:   font-style: italic;
      22: *{overrides}*{userOverrides})*)

      0: style {
      1: font-size: 2em;
      2: text-transform: uppercase;
      3:  color: red;
      4: font-style: italic;
      5: font-style: normal;
      6: }
    */

    const sections = [
      {
        startLineIndex: 10,
        startColumnIndex: 12,
        endLineIndex: 18,
        endColumnIndex: 0,
        grammar: "js",
        startContextString: "() => {",
        endContextString: "}",
        skippedSections: [
          {
            startLineIndex: 11,
            startColumnIndex: 19,
            endLineIndex: 11,
            endColumnIndex: 30,
            replacement: "''",
          },
          {
            startLineIndex: 12,
            startColumnIndex: 44,
            endLineIndex: 15,
            endColumnIndex: 5,
            replacement: "''",
          },
        ],
      },
      {
        startLineIndex: 20,
        startColumnIndex: 18,
        endLineIndex: 22,
        endColumnIndex: 29,
        startContextString: "style {\n",
        endContextString: "\n}",
        skippedSections: [
          {
            startLineIndex: 20,
            startColumnIndex: 18,
            endLineIndex: 20,
            endColumnIndex: 34,
            replacement: "font-size: 2em;\ntext-transform: uppercase;\n",
          },
          {
            startLineIndex: 22,
            startColumnIndex: 0,
            endLineIndex: 22,
            endColumnIndex: 12,
            replacement: "font-style: normal;\n",
          },
          { startLineIndex: 22, startColumnIndex: 12, endLineIndex: 22, endColumnIndex: 29 },
        ],
      },
    ]

    const { getDocumentIndexes } = mapSectionIndexesToDocumentIndexes(sections)

    // expect(getDocumentIndexes(0, 0, 0)).toBe(null) // Context string
    // expect(getDocumentIndexes(0, 1, 0)).toEqual([11, 0])
    // expect(getDocumentIndexes(0, 1, 18)).toEqual([11, 18]) // Last before replacement
    // expect(getDocumentIndexes(0, 1, 19)).toBe(null) // Replacement 1
    // expect(getDocumentIndexes(0, 1, 20)).toBe(null) // Replacement 1
    // expect(getDocumentIndexes(0, 2, 0)).toEqual([12, 0]) // Replacement 2 end
    // expect(getDocumentIndexes(0, 2, 43)).toEqual([12, 43]) // Last before replacement 2
    // expect(getDocumentIndexes(0, 2, 44)).toBe(null) // Replacement 2
    // expect(getDocumentIndexes(0, 2, 45)).toBe(null) // Replacement 2
    // expect(getDocumentIndexes(0, 2, 46)).toEqual([15, 5]) // Replacement 2 end
    // expect(getDocumentIndexes(0, 3, 0)).toEqual([16, 0])
    // expect(getDocumentIndexes(0, 4, 0)).toEqual([17, 0])

    expect(getDocumentIndexes(0 /* 1 */, 0, 0)).toBe(null) // Context string
    expect(getDocumentIndexes(0 /* 1 */, 1, 0)).toBe(null) // Replacement 1
    expect(getDocumentIndexes(0 /* 1 */, 2, 0)).toBe(null) // Replacement 1
    expect(getDocumentIndexes(0 /* 1 */, 3, 0)).toEqual([20, 34]) // Start of highlighting
    expect(getDocumentIndexes(0 /* 1 */, 3, 11)).toEqual([20, 45])
    expect(getDocumentIndexes(0 /* 1 */, 4, 0)).toBe(null) // Replacement 2
    expect(getDocumentIndexes(0 /* 1 */, 5, 0)).toBe(null) // Replacement 2
    expect(getDocumentIndexes(0 /* 1 */, 6, 0)).toBe(null) // Context string
  })
})
