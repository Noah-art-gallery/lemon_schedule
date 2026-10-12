import { beforeEach, expect, it, vi } from "vitest";
beforeEach(() => vi.resetModules());
it("shares first-completion points, profile changes and pet state across screens", async () => {
  const store = await import("./demo-task-store");
  expect(store.demoGetProfile().lemonPoints).toBe(store.demoListHistory().length);
  store.demoToggleOccurrence(2);
  store.demoToggleOccurrence(2);
  store.demoToggleOccurrence(2);
  expect(store.demoGetPet().lemonPoints).toBe(3);
  store.demoUpdateProfile({ displayName: "유나", timeZone: "America/New_York" });
  expect(store.demoGetProfile()).toMatchObject({
    displayName: "유나",
    timeZone: "America/New_York",
  });
  store.demoSavePetDrawing("blob:preview");
  expect(store.demoGetPetImage()).toBe("blob:preview");
  expect(() =>
    store.demoSaveDecorations({
      selectedColor: "lemon-yellow",
      selectedAccessory: null,
      selectedBackground: null,
    }),
  ).toThrow();
  store.demoToggleOccurrence(3);
  store.demoToggleOccurrence(4);
  store.demoSaveDecorations({
    selectedColor: "lemon-yellow",
    selectedAccessory: null,
    selectedBackground: null,
  });
  expect(store.demoGetPet()).toMatchObject({
    lemonPoints: 5,
    petLevel: 2,
    decorations: { selectedColor: "lemon-yellow" },
  });
});
it("shows blocks in the shared profile and unblocking does not reconnect", async () => {
  const store = await import("./demo-task-store");
  store.demoDisconnectFriend("demo-friend-1", true);
  expect(store.demoGetProfile().blocked).toEqual([{ id: "demo-friend-1", displayName: "지민" }]);
  store.demoUnblockUser("demo-friend-1");
  expect(store.demoGetProfile().blocked).toEqual([]);
  expect(store.demoGetConnections().friends.some((friend) => friend.id === "demo-friend-1")).toBe(
    false,
  );
  expect(() => store.demoGetDetail(101)).toThrow();
});
