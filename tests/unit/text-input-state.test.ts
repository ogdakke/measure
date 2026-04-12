import { describe, expect, test } from "bun:test";
import {
  applyTextInputKey,
  createTextInputState,
  type TextInputKey,
  type TextInputState,
} from "../../src/ui/text-input-state.ts";

const EMPTY_KEY: TextInputKey = {
  return: false,
  backspace: false,
  delete: false,
  upArrow: false,
  downArrow: false,
  leftArrow: false,
  rightArrow: false,
  home: false,
  end: false,
  ctrl: false,
  meta: false,
  tab: false,
  escape: false,
};

function key(overrides: Partial<TextInputKey> = {}): TextInputKey {
  return { ...EMPTY_KEY, ...overrides };
}

function press(
  state: TextInputState,
  input = "",
  nextKey: Partial<TextInputKey> = {},
  history: string[] = [],
): TextInputState {
  return applyTextInputKey(state, input, key(nextKey), history).state;
}

function typeText(state: TextInputState, text: string): TextInputState {
  return applyTextInputKey(state, text, key(), []).state;
}

describe("text input state", () => {
  test("inserts text at the cursor and handles backspace/delete", () => {
    let state = typeText(createTextInputState(), "hello");
    state = press(state, "", { leftArrow: true });
    state = press(state, "", { leftArrow: true });
    state = typeText(state, "X");

    expect(state).toMatchObject({
      value: "helXlo",
      cursor: 4,
      historyIndex: -1,
    });

    state = press(state, "", { backspace: true });
    expect(state).toMatchObject({
      value: "hello",
      cursor: 3,
    });

    state = press(state, "", { delete: true });
    expect(state).toMatchObject({
      value: "helo",
      cursor: 3,
    });
  });

  test("supports mac and alt-style backward word deletion", () => {
    let state = typeText(createTextInputState(), "git status now");

    state = press(state, "", { backspace: true, meta: true });
    expect(state).toMatchObject({
      value: "git status ",
      cursor: 11,
    });

    state = press(state, "", { backspace: true, meta: true });
    expect(state).toMatchObject({
      value: "git ",
      cursor: 4,
    });

    state = press(state, "", { backspace: true, ctrl: true });
    expect(state).toMatchObject({
      value: "",
      cursor: 0,
    });
  });

  test("supports forward word deletion from ctrl+delete and alt+d", () => {
    let state = typeText(createTextInputState(), "git status now");
    state = press(state, "", { home: true });
    state = press(state, "", { delete: true, ctrl: true });

    expect(state).toMatchObject({
      value: " status now",
      cursor: 0,
    });

    state = press(state, "d", { meta: true });
    expect(state).toMatchObject({
      value: " now",
      cursor: 0,
    });
  });

  test("supports word-wise cursor movement on mac and windows-style keys", () => {
    let state = typeText(createTextInputState(), "git status now");

    state = press(state, "", { leftArrow: true, meta: true });
    expect(state.cursor).toBe(11);

    state = press(state, "", { leftArrow: true, ctrl: true });
    expect(state.cursor).toBe(4);

    state = press(state, "f", { meta: true });
    expect(state.cursor).toBe(10);

    state = press(state, "", { rightArrow: true, ctrl: true });
    expect(state.cursor).toBe(14);
  });

  test("supports readline cursor and kill commands", () => {
    let state = typeText(createTextInputState(), "bun run build");

    state = press(state, "a", { ctrl: true });
    expect(state.cursor).toBe(0);

    state = press(state, "f", { ctrl: true });
    expect(state.cursor).toBe(1);

    state = press(state, "e", { ctrl: true });
    expect(state.cursor).toBe(13);

    state = press(state, "b", { ctrl: true });
    expect(state.cursor).toBe(12);

    state = press(state, "u", { ctrl: true });
    expect(state).toMatchObject({
      value: "d",
      cursor: 0,
    });

    state = typeText(state, "one two");
    state = press(state, "k", { ctrl: true });
    expect(state).toMatchObject({
      value: "one two",
      cursor: 7,
    });
  });

  test("supports ctrl+w and ctrl+d", () => {
    let state = typeText(createTextInputState(), "measure repl");

    state = press(state, "w", { ctrl: true });
    expect(state).toMatchObject({
      value: "measure ",
      cursor: 8,
    });

    state = press(state, "", { home: true });
    state = press(state, "d", { ctrl: true });
    expect(state).toMatchObject({
      value: "easure ",
      cursor: 0,
    });
  });

  test("supports ctrl+l to clear the screen without discarding input", () => {
    const state = typeText(createTextInputState(), "draft command");
    const result = applyTextInputKey(state, "l", key({ ctrl: true }), []);

    expect(result.clearScreen).toBe(true);
    expect(result.submit).toBeUndefined();
    expect(result.state).toEqual(state);
  });

  test("preserves history browsing while moving the cursor and restores drafts", () => {
    const history = ["git status", "bun test"];

    let state = typeText(createTextInputState(), "draft command");
    state = press(state, "", { upArrow: true }, history);
    expect(state).toMatchObject({
      value: "git status",
      cursor: 10,
      historyIndex: 0,
      savedInput: "draft command",
    });

    state = press(state, "", { leftArrow: true });
    expect(state).toMatchObject({
      value: "git status",
      cursor: 9,
      historyIndex: 0,
    });

    state = press(state, "", { upArrow: true }, history);
    expect(state).toMatchObject({
      value: "bun test",
      historyIndex: 1,
    });

    state = press(state, "", { downArrow: true }, history);
    expect(state).toMatchObject({
      value: "git status",
      historyIndex: 0,
    });

    state = press(state, "", { downArrow: true }, history);
    expect(state).toMatchObject({
      value: "draft command",
      cursor: 13,
      historyIndex: -1,
    });
  });

  test("leaves history mode once a recalled line is edited", () => {
    const history = ["git status"];

    let state = press(createTextInputState(), "", { upArrow: true }, history);
    state = press(state, "", { leftArrow: true });
    state = typeText(state, "!");

    expect(state).toMatchObject({
      value: "git statu!s",
      historyIndex: -1,
      cursor: 10,
    });
  });

  test("submits the current value and resets state", () => {
    const result = applyTextInputKey(
      typeText(createTextInputState(), "bun test"),
      "",
      key({ return: true }),
      [],
    );

    expect(result.submit).toBe("bun test");
    expect(result.state).toEqual(createTextInputState());
  });
});
