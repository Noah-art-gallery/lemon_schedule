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
it("disconnects without retaining a block list or restoring the connection", async () => {
  const store = await import("./demo-task-store");
  store.demoDisconnectFriend("demo-friend-1");
  expect(store.demoGetConnections().friends.some((friend) => friend.id === "demo-friend-1")).toBe(
    false,
  );
  expect(store.demoGetProfile()).not.toHaveProperty("blocked");
  expect(() => store.demoGetDetail(101)).toThrow();
});
it("shares the selected profile avatar with own details and encouragement author projections", async () => {
  const store = await import("./demo-task-store");
  expect(store.demoGetProfile().avatarKey).toBe("lemon");
  store.demoUpdateProfile({ avatarKey: "penguin" });
  expect(store.demoGetProfile().avatarKey).toBe("penguin");
  expect(store.demoGetDetail(1).owner.avatarKey).toBe("penguin");
  store.demoSendEncouragement(101, "clap", "함께 해요");
  expect(store.demoGetDetail(101).summary.latestMessage?.authorAvatarKey).toBe("penguin");
  store.demoUpdateProfile({ avatarKey: "flower" });
  expect(
    store.demoGetDetail(101).encouragements.find((item) => item.author_id === "demo")
      ?.authorAvatarKey,
  ).toBe("flower");
  expect(store.demoListSocial()[0].owner.avatarKey).toBeDefined();
  store.demoDisconnectFriend("demo-friend-1");
  expect(store.demoGetDetail(1).encouragements[0].authorAvatarKey).toBe("lemon");
});
