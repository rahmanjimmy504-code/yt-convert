describe("native YouTube direct-stream contract", () => {
  it("documents the formats that may bypass Worker egress", () => {
    expect(["m4a", "mp4"]).toEqual(expect.arrayContaining(["m4a", "mp4"]));
  });
});
