test("formats inline snapshots with the project's Prettier",()=>{expect({greeting:"hello",nested:{value:1}}).toMatchInlineSnapshot()})
